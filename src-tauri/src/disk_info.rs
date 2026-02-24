use windows_sys::Win32::Storage::FileSystem::{
    CreateFileW, FILE_FLAG_BACKUP_SEMANTICS, FILE_SHARE_READ, FILE_SHARE_WRITE, OPEN_EXISTING,
};
use windows_sys::Win32::System::IO::DeviceIoControl;
use windows_sys::Win32::System::Ioctl::{
    StorageDeviceProperty, StorageDeviceSeekPenaltyProperty, IOCTL_STORAGE_QUERY_PROPERTY,
    STORAGE_PROPERTY_QUERY,
};

#[derive(Debug, Clone, Copy, PartialEq, serde::Serialize)]
pub enum DiskKind {
    NVMe,
    SSD,
    HDD,
    Unknown,
}

impl DiskKind {
    pub fn optimal_buf_size(self) -> usize {
        match self {
            DiskKind::NVMe    => 8 * 1024 * 1024,
            DiskKind::SSD     => 4 * 1024 * 1024,
            DiskKind::HDD     => 1024 * 1024,
            DiskKind::Unknown => 2 * 1024 * 1024,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            DiskKind::NVMe    => "NVMe",
            DiskKind::SSD     => "SSD",
            DiskKind::HDD     => "HDD",
            DiskKind::Unknown => "Unknown",
        }
    }
}

#[repr(C)]
struct StorageDeviceDescriptor {
    version: u32,
    size: u32,
    device_type: u8,
    device_type_modifier: u8,
    removable_media: u8,
    command_queueing: u8,
    vendor_id_offset: u32,
    product_id_offset: u32,
    product_revision_offset: u32,
    serial_number_offset: u32,
    bus_type: u32,
    raw_properties_length: u32,
}

#[repr(C)]
struct DeviceSeekPenaltyDescriptor {
    version: u32,
    size: u32,
    incurs_seek_penalty: u8,
}

pub fn detect_disk_kind(drive_letter: &str) -> DiskKind {
    let volume_path: Vec<u16> = format!("\\\\.\\{}\\", drive_letter.trim_end_matches('\\'))
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();

    let handle = unsafe {
        CreateFileW(
            volume_path.as_ptr(),
            0,
            FILE_SHARE_READ | FILE_SHARE_WRITE,
            std::ptr::null(),
            OPEN_EXISTING,
            FILE_FLAG_BACKUP_SEMANTICS,
            std::ptr::null_mut(),
        )
    };

    if handle.is_null() || handle as isize == -1 {
        return DiskKind::Unknown;
    }

    let kind = probe_disk(handle);

    unsafe {
        windows_sys::Win32::Foundation::CloseHandle(handle);
    }

    kind
}

fn probe_disk(handle: *mut core::ffi::c_void) -> DiskKind {
    let seek_penalty = query_seek_penalty(handle);
    let bus_type = query_bus_type(handle);

    match (bus_type, seek_penalty) {
        (Some(bus), _) if bus == 17 => DiskKind::NVMe,
        (_, Some(false)) => DiskKind::SSD,
        (_, Some(true))  => DiskKind::HDD,
        _ => DiskKind::Unknown,
    }
}

fn query_seek_penalty(handle: *mut core::ffi::c_void) -> Option<bool> {
    let query = STORAGE_PROPERTY_QUERY {
        PropertyId: StorageDeviceSeekPenaltyProperty,
        QueryType: 0,
        AdditionalParameters: [0u8],
    };

    let mut descriptor = DeviceSeekPenaltyDescriptor {
        version: 0,
        size: 0,
        incurs_seek_penalty: 0,
    };
    let mut bytes_returned: u32 = 0;

    let ok = unsafe {
        DeviceIoControl(
            handle,
            IOCTL_STORAGE_QUERY_PROPERTY,
            &query as *const _ as *const _,
            std::mem::size_of::<STORAGE_PROPERTY_QUERY>() as u32,
            &mut descriptor as *mut _ as *mut _,
            std::mem::size_of::<DeviceSeekPenaltyDescriptor>() as u32,
            &mut bytes_returned,
            std::ptr::null_mut(),
        )
    };

    if ok != 0 && bytes_returned >= std::mem::size_of::<DeviceSeekPenaltyDescriptor>() as u32 {
        Some(descriptor.incurs_seek_penalty != 0)
    } else {
        None
    }
}

fn query_bus_type(handle: *mut core::ffi::c_void) -> Option<u32> {
    let query = STORAGE_PROPERTY_QUERY {
        PropertyId: StorageDeviceProperty,
        QueryType: 0,
        AdditionalParameters: [0u8],
    };

    let mut descriptor = StorageDeviceDescriptor {
        version: 0,
        size: 0,
        device_type: 0,
        device_type_modifier: 0,
        removable_media: 0,
        command_queueing: 0,
        vendor_id_offset: 0,
        product_id_offset: 0,
        product_revision_offset: 0,
        serial_number_offset: 0,
        bus_type: 0,
        raw_properties_length: 0,
    };
    let mut bytes_returned: u32 = 0;

    let ok = unsafe {
        DeviceIoControl(
            handle,
            IOCTL_STORAGE_QUERY_PROPERTY,
            &query as *const _ as *const _,
            std::mem::size_of::<STORAGE_PROPERTY_QUERY>() as u32,
            &mut descriptor as *mut _ as *mut _,
            std::mem::size_of::<StorageDeviceDescriptor>() as u32,
            &mut bytes_returned,
            std::ptr::null_mut(),
        )
    };

    if ok != 0 && bytes_returned >= std::mem::size_of::<StorageDeviceDescriptor>() as u32 {
        Some(descriptor.bus_type)
    } else {
        None
    }
}
