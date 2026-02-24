#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod ntfs_scanner;
mod path_builder;
mod index;
mod search;
mod disk_info;
mod fallback_scanner;
mod compression;
mod utf_tiny;

use mimalloc::MiMalloc;
#[global_allocator]
static GLOBAL: MiMalloc = MiMalloc;

use parking_lot::RwLock;
use std::sync::Arc;
use std::path::PathBuf;
use tauri::{Manager, State};
use fst::Map;
use search::SearchResponse;
use disk_info::DiskKind;
use index::DozipRegistry;
use compression::CompressResult;

struct AppState {
    index: Arc<RwLock<Option<(Map<Vec<u8>>, DozipRegistry)>>>,
    status: Arc<RwLock<String>>,
    disk_kind: Arc<RwLock<DiskKind>>,
    scan_method: Arc<RwLock<String>>,
    index_time: Arc<RwLock<u64>>,
}

#[tauri::command]
fn get_index_status(state: State<AppState>) -> String {
    state.status.read().clone()
}

#[tauri::command]
fn get_disk_info(state: State<AppState>) -> String {
    state.disk_kind.read().as_str().to_string()
}

#[tauri::command]
fn get_scan_method(state: State<AppState>) -> String {
    state.scan_method.read().clone()
}

#[tauri::command]
fn get_index_time(state: State<AppState>) -> u64 {
    *state.index_time.read()
}

#[tauri::command]
fn search(query: String, state: State<AppState>) -> SearchResponse {
    let guard = state.index.read();
    match guard.as_ref() {
        Some((map, originals)) => search::search_full(map, originals, &query, 200),
        None => SearchResponse { results: vec![], suggestions: vec![], is_fuzzy: false },
    }
}

#[tauri::command]
fn compress_zip(paths: Vec<String>, output: String) -> Result<CompressResult, String> {
    let input_paths: Vec<PathBuf> = paths.iter().map(PathBuf::from).collect();
    compression::compress_zip(&input_paths, &PathBuf::from(&output))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn compress_tar_gz(paths: Vec<String>, output: String) -> Result<CompressResult, String> {
    let input_paths: Vec<PathBuf> = paths.iter().map(PathBuf::from).collect();
    compression::compress_tar_gz(&input_paths, &PathBuf::from(&output))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn compress_7z(paths: Vec<String>, output: String) -> Result<CompressResult, String> {
    let input_paths: Vec<PathBuf> = paths.iter().map(PathBuf::from).collect();
    compression::compress_7z(&input_paths, &PathBuf::from(&output))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn compress_dozip(path: String, output: String, lossy: bool) -> Result<CompressResult, String> {
    compression::compress_dozip(&PathBuf::from(&path), &PathBuf::from(&output), lossy)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn compress_generic(paths: Vec<String>, output: String, format: String) -> Result<CompressResult, String> {
    let input_paths: Vec<PathBuf> = paths.iter().map(PathBuf::from).collect();
    if format.starts_with("tar.") {
        compression::compress_tar_archive(&input_paths, &PathBuf::from(&output), &format)
            .map_err(|e| e.to_string())
    } else {
        if input_paths.is_empty() { return Err("No input files".into()); }
        compression::compress_file_single(&input_paths[0], &PathBuf::from(&output), &format)
            .map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn decompress(path: String, output_dir: String) -> Result<(), String> {
    compression::decompress(&PathBuf::from(&path), &PathBuf::from(&output_dir))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_auto_output_path(input_path: String, ext: String) -> String {
    compression::auto_output_path(&PathBuf::from(input_path), &ext)
        .to_string_lossy()
        .into_owned()
}

#[derive(serde::Serialize)]
struct DirEntry { name: String, path: String, is_dir: bool, size: u64 }

#[tauri::command]
fn list_directory(path: String) -> Result<Vec<DirEntry>, String> {
    std::fs::read_dir(&path)
        .map_err(|e| e.to_string())
        .map(|iter| {
            iter.filter_map(|e| e.ok()).map(|e| {
                let meta = e.metadata().ok();
                DirEntry {
                    name: e.file_name().to_string_lossy().into_owned(),
                    path: e.path().to_string_lossy().into_owned(),
                    is_dir: meta.as_ref().map(|m| m.is_dir()).unwrap_or(false),
                    size: meta.as_ref().map(|m| m.len()).unwrap_or(0),
                }
            }).collect()
        })
}

#[tauri::command]
fn get_drives() -> Vec<String> {
    #[cfg(windows)]
    return (b'A'..=b'Z')
        .filter_map(|c| {
            let d = format!("{}:\\", c as char);
            if std::path::Path::new(&d).exists() { Some(d) } else { None }
        })
        .collect();
    #[cfg(not(windows))]
    vec!["/".to_string()]
}

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    let data = std::fs::read(&path).map_err(|e| e.to_string())?;
    if utf_tiny::is_utf_tiny(&data) {
        utf_tiny::decode(&data)
    } else {
        String::from_utf8(data).map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn write_file(path: String, content: String, encoding: String) -> Result<(), String> {
    let data = if encoding.starts_with("UTT") {
        let variant = if encoding.ends_with('C') { "C" } else { "T" };
        utf_tiny::encode(&content, variant)
    } else {
        content.into_bytes()
    };
    std::fs::write(&path, data).map_err(|e| e.to_string())
}

#[tauri::command]
fn encode_utf_tiny(text: String, variant: String) -> Vec<u8> {
    utf_tiny::encode(&text, &variant)
}

#[tauri::command]
fn decode_utf_tiny(data: Vec<u8>) -> Result<String, String> {
    utf_tiny::decode(&data)
}

#[derive(serde::Serialize)]
struct FileInfo {
    size: u64,
    modified: u64,
}

#[tauri::command]
fn get_file_info(path: String) -> Option<FileInfo> {
    std::fs::metadata(&path).ok().map(|m| {
        let modified = m.modified()
            .unwrap_or(std::time::SystemTime::UNIX_EPOCH)
            .duration_since(std::time::SystemTime::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        FileInfo { size: m.len(), modified }
    })
}

fn main() {
    #[cfg(windows)]
    {
        elevate_process_priority();
        admin_perf_setup();
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let index_lock: Arc<RwLock<Option<(Map<Vec<u8>>, DozipRegistry)>>> =
                Arc::new(RwLock::new(None));
            let status_lock: Arc<RwLock<String>> = Arc::new(RwLock::new("building".into()));
            let disk_kind_lock: Arc<RwLock<DiskKind>> = Arc::new(RwLock::new(DiskKind::Unknown));
            let scan_method_lock: Arc<RwLock<String>> = Arc::new(RwLock::new(String::new()));
            let index_time_lock: Arc<RwLock<u64>> = Arc::new(RwLock::new(0));

            app.manage(AppState {
                index: index_lock.clone(),
                status: status_lock.clone(),
                disk_kind: disk_kind_lock.clone(),
                scan_method: scan_method_lock.clone(),
                index_time: index_time_lock.clone(),
            });

            std::thread::spawn(move || {
                let kind = disk_info::detect_disk_kind("C:");
                *disk_kind_lock.write() = kind;
                let buf_size = kind.optimal_buf_size();

                let use_mft = ntfs_scanner::probe_usn("C:");
                let method = if use_mft { "MFT" } else { "Dir scan" };
                *scan_method_lock.write() = method.to_string();

                eprintln!("[FileDozer] Disk: {:?} | Buffer: {} KB | Scanner: {}", kind, buf_size / 1024, method);

                let t0 = std::time::Instant::now();

                let result = if use_mft {
                    ntfs_scanner::scan_volume("C:", buf_size)
                        .map_err(|e| e.to_string())
                        .and_then(|raw| {
                            let paths = path_builder::build_paths(raw);
                            index::build_fst_with_originals(paths).map_err(|e| e.to_string())
                        })
                } else {
                    let paths = fallback_scanner::scan_drive("C:");
                    index::build_fst_with_originals(paths).map_err(|e| e.to_string())
                };

                let elapsed = t0.elapsed().as_secs();

                match result {
                    Ok((map, registry)) => {
                        #[cfg(windows)]
                        virtual_lock_fst(&map);
                        
                        // Serialize DozipRegistry in the background for max crunch bincode+zstd
                        if let Ok(f) = std::fs::File::create(std::env::temp_dir().join("filedozer_cache.dz")) {
                            if let Ok(mut enc) = zstd::stream::Encoder::new(f, 3) {
                                let _ = bincode::serialize_into(&mut enc, &registry);
                                let _ = enc.finish();
                            }
                        }

                        *index_lock.write() = Some((map, registry));
                        *index_time_lock.write() = elapsed;
                        *status_lock.write() = "ready".into();
                    }
                    Err(e) => {
                        eprintln!("Index build failed: {e}");
                        *status_lock.write() = "error".into();
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_index_status, get_disk_info, get_scan_method, get_index_time,
            search, get_file_info,
            compress_zip, compress_tar_gz, compress_7z, compress_dozip, compress_generic,
            decompress, get_auto_output_path,
            read_file, write_file, encode_utf_tiny, decode_utf_tiny,
            list_directory, get_drives,
        ])
        .run(tauri::generate_context!())
        .expect("tauri runtime error");
}

#[cfg(windows)]
fn elevate_process_priority() {
    use windows_sys::Win32::System::Threading::{
        GetCurrentProcess, SetPriorityClass, HIGH_PRIORITY_CLASS,
    };
    unsafe { SetPriorityClass(GetCurrentProcess(), HIGH_PRIORITY_CLASS) };
}

#[cfg(windows)]
fn admin_perf_setup() {
    use windows_sys::Win32::System::Threading::GetCurrentProcess;
    
    #[link(name = "kernel32")]
    extern "system" {
        fn LoadLibraryA(lpLibFileName: *const u8) -> *mut core::ffi::c_void;
        fn GetProcAddress(
            hModule: *mut core::ffi::c_void,
            lpProcName: *const u8,
        ) -> *mut core::ffi::c_void;
    }


    unsafe {
        // Dynamically load timeBeginPeriod from winmm.dll
        let h_winmm = LoadLibraryA(b"winmm.dll\0".as_ptr());
        if !h_winmm.is_null() {
            let func_name = b"timeBeginPeriod\0";
            let proc = GetProcAddress(h_winmm, func_name.as_ptr());
            if !proc.is_null() {
                let time_begin_period: extern "system" fn(u32) -> u32 = std::mem::transmute(proc);
                time_begin_period(1);
            }
        }

        // Dynamically load SetProcessWorkingSetSizeEx from kernel32.dll
        let h_kernel32 = LoadLibraryA(b"kernel32.dll\0".as_ptr());
        if !h_kernel32.is_null() {
            let func_name = b"SetProcessWorkingSetSizeEx\0";
            let proc = GetProcAddress(h_kernel32, func_name.as_ptr());
            if !proc.is_null() {
                let set_process_ws: extern "system" fn(
                    isize, usize, usize, u32
                ) -> i32 = std::mem::transmute(proc);
                
                // QUOTA_LIMITS_HARDWS_MIN_ENABLE = 1
                set_process_ws(
                    GetCurrentProcess() as isize,
                    256 * 1024 * 1024,
                    2 * 1024 * 1024 * 1024,
                    1,
                );
            }
        }
    }

    // Pre-spawn the rayon global thread pool at max logical cores
    let _ = rayon::ThreadPoolBuilder::new()
        .num_threads(num_cpus::get())
        .build_global();
}

#[cfg(windows)]
fn virtual_lock_fst(map: &Map<Vec<u8>>) {
    use windows_sys::Win32::System::Memory::VirtualLock;
    let data = map.as_fst().as_bytes();
    unsafe { VirtualLock(data.as_ptr() as *mut _, data.len()) };
}
