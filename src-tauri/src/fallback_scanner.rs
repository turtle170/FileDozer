use rayon::prelude::*;
use std::ffi::OsString;
use std::os::windows::ffi::OsStringExt;
use windows_sys::Win32::Storage::FileSystem::{
    FindClose, FindFirstFileExW, FindNextFileW, WIN32_FIND_DATAW,
    FindExInfoBasic, FindExSearchNameMatch, FIND_FIRST_EX_LARGE_FETCH,
    FILE_ATTRIBUTE_DIRECTORY,
};
use windows_sys::Win32::System::Threading::{
    GetCurrentThread, SetThreadPriority, THREAD_PRIORITY_ABOVE_NORMAL,
};

pub fn scan_drive(root: &str) -> Vec<(String, String, bool)> {
    unsafe { SetThreadPriority(GetCurrentThread(), THREAD_PRIORITY_ABOVE_NORMAL) };
    let root_dir = format!("{}\\", root.trim_end_matches('\\'));
    walk(root_dir)
}

fn walk(dir: String) -> Vec<(String, String, bool)> {
    let pattern: Vec<u16> = format!("{}*", dir)
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();

    let mut find_data: WIN32_FIND_DATAW = unsafe { std::mem::zeroed() };

    let handle = unsafe {
        FindFirstFileExW(
            pattern.as_ptr(),
            FindExInfoBasic,
            &mut find_data as *mut _ as *mut _,
            FindExSearchNameMatch,
            std::ptr::null(),
            FIND_FIRST_EX_LARGE_FETCH,
        )
    };

    if handle.is_null() || handle as isize == -1 {
        return vec![];
    }

    let mut entries: Vec<(String, String, bool)> = Vec::new();
    let mut subdirs: Vec<String> = Vec::new();

    loop {
        let name_end = find_data.cFileName.iter().position(|&c| c == 0).unwrap_or(260);
        let name = OsString::from_wide(&find_data.cFileName[..name_end]).to_string_lossy().into_owned();

        if name != "." && name != ".." {
            let is_dir = (find_data.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) != 0;
            let full = format!("{}{}", dir, name);
            let mut lower = full.clone();
            lower.make_ascii_lowercase();
            if is_dir {
                subdirs.push(format!("{}\\", full));
            }
            entries.push((lower, full, is_dir));
        }

        if unsafe { FindNextFileW(handle, &mut find_data) } == 0 {
            break;
        }
    }

    unsafe { FindClose(handle) };

    let sub_entries: Vec<Vec<(String, String, bool)>> = subdirs
        .into_par_iter()
        .map(walk)
        .collect();

    for batch in sub_entries {
        entries.extend(batch);
    }

    entries
}
