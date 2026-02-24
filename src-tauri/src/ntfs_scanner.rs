#[derive(Debug, Clone)]
pub struct RawEntry {
    pub file_id: u64,
    pub parent_id: u64,
    pub name: String,
    pub is_dir: bool,
}

#[cfg(windows)]
mod win {
    use super::RawEntry;
    use std::ffi::OsString;
    use std::os::windows::ffi::OsStringExt;
    use windows_sys::Win32::Foundation::GetLastError;
    use windows_sys::Win32::Storage::FileSystem::{
        FILE_FLAG_BACKUP_SEMANTICS, FILE_SHARE_READ, FILE_SHARE_WRITE,
        OPEN_EXISTING, FILE_ATTRIBUTE_DIRECTORY, CreateFileW,
    };
    use windows_sys::Win32::System::IO::DeviceIoControl;
    use windows_sys::Win32::System::Ioctl::{
        FSCTL_ENUM_USN_DATA, MFT_ENUM_DATA_V0, USN_RECORD_V2,
    };
    use windows_sys::Win32::System::Threading::{
        GetCurrentThread, SetThreadPriority, THREAD_PRIORITY_ABOVE_NORMAL,
    };

    const FSCTL_QUERY_USN_JOURNAL: u32 = 0x000900F4;

    fn is_invalid(h: *mut core::ffi::c_void) -> bool {
        h.is_null() || h as isize == -1
    }

    fn open_volume(drive: &str) -> *mut core::ffi::c_void {
        let path: Vec<u16> = format!("\\\\.\\{}", drive)
            .encode_utf16()
            .chain(std::iter::once(0))
            .collect();
        unsafe {
            CreateFileW(
                path.as_ptr(),
                0x8000_0000u32,
                FILE_SHARE_READ | FILE_SHARE_WRITE,
                std::ptr::null(),
                OPEN_EXISTING,
                FILE_FLAG_BACKUP_SEMANTICS,
                std::ptr::null_mut(),
            )
        }
    }

    fn close(h: *mut core::ffi::c_void) {
        unsafe { windows_sys::Win32::Foundation::CloseHandle(h) };
    }

    pub fn probe_usn(drive: &str) -> bool {
        let handle = open_volume(drive);
        if is_invalid(handle) { return false; }
        let mut data = [0u8; 80];
        let mut bytes: u32 = 0;
        let ok = unsafe {
            DeviceIoControl(
                handle,
                FSCTL_QUERY_USN_JOURNAL,
                std::ptr::null(),
                0,
                data.as_mut_ptr() as *mut _,
                data.len() as u32,
                &mut bytes,
                std::ptr::null_mut(),
            )
        };
        close(handle);
        ok != 0
    }

    pub fn scan_volume(drive: &str, buf_size: usize) -> Result<Vec<RawEntry>, String> {
        unsafe { SetThreadPriority(GetCurrentThread(), THREAD_PRIORITY_ABOVE_NORMAL) };

        let handle = open_volume(drive);
        if is_invalid(handle) {
            return Err(format!("Failed to open volume. Error: {}", unsafe { GetLastError() }));
        }

        let mut entries = Vec::with_capacity(500_000);
        let mut buf: Vec<u8> = vec![0u8; buf_size];
        let mut med = MFT_ENUM_DATA_V0 { StartFileReferenceNumber: 0, LowUsn: 0, HighUsn: i64::MAX };

        loop {
            let mut bytes_returned: u32 = 0;
            let ok = unsafe {
                DeviceIoControl(
                    handle,
                    FSCTL_ENUM_USN_DATA,
                    &med as *const _ as *const _,
                    std::mem::size_of::<MFT_ENUM_DATA_V0>() as u32,
                    buf.as_mut_ptr() as *mut _,
                    buf_size as u32,
                    &mut bytes_returned,
                    std::ptr::null_mut(),
                )
            };
            if ok == 0 || bytes_returned <= 8 { break; }

            let next_usn = unsafe { *(buf.as_ptr() as *const i64) };
            let mut offset: usize = 8;

            while offset + std::mem::size_of::<USN_RECORD_V2>() <= bytes_returned as usize {
                let rec = unsafe { &*(buf.as_ptr().add(offset) as *const USN_RECORD_V2) };
                if rec.RecordLength == 0 { break; }

                let name_offset = rec.FileNameOffset as usize;
                let name_len = rec.FileNameLength as usize / 2;
                let name_ptr = unsafe { buf.as_ptr().add(offset + name_offset) as *const u16 };
                let name_slice = unsafe { std::slice::from_raw_parts(name_ptr, name_len) };
                let name = OsString::from_wide(name_slice).to_string_lossy().into_owned();
                let is_dir = (rec.FileAttributes & FILE_ATTRIBUTE_DIRECTORY) != 0;

                entries.push(RawEntry {
                    file_id: rec.FileReferenceNumber & 0x0000_FFFF_FFFF_FFFF,
                    parent_id: rec.ParentFileReferenceNumber & 0x0000_FFFF_FFFF_FFFF,
                    name,
                    is_dir,
                });
                offset += rec.RecordLength as usize;
            }
            med.StartFileReferenceNumber = next_usn as u64;
        }

        close(handle);
        Ok(entries)
    }
}

#[cfg(windows)]
pub use win::{probe_usn, scan_volume};

#[cfg(not(windows))]
pub fn probe_usn(_drive: &str) -> bool { false }

#[cfg(not(windows))]
pub fn scan_volume(_drive: &str, _buf_size: usize) -> Result<Vec<RawEntry>, String> {
    Err("NTFS scanning is Windows-only".into())
}
