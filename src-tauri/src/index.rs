use fst::{Map, MapBuilder};
use std::collections::HashMap;

#[derive(serde::Serialize, serde::Deserialize)]
pub struct DozipEntry {
    pub parent_id: u32,
    pub name: String,
    pub is_dir: bool,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct DozipRegistry {
    pub parents: Vec<String>,
    pub entries: Vec<DozipEntry>,
}

pub fn build_fst_with_originals(
    mut paths: Vec<(String, String, bool)>,
) -> Result<(Map<Vec<u8>>, DozipRegistry), fst::Error> {
    paths.dedup_by(|a, b| a.0 == b.0);

    let mut builder = MapBuilder::memory();
    
    let mut parents_map: HashMap<String, u32> = HashMap::new();
    let mut parents_vec: Vec<String> = Vec::new();
    let mut entries: Vec<DozipEntry> = Vec::with_capacity(paths.len());
    
    let mut idx: u64 = 0;

    for (lower_key, path, is_dir) in &paths {
        if builder.insert(lower_key.as_bytes(), idx).is_ok() {
            let path_obj = std::path::Path::new(path);
            let parent_str = path_obj.parent().unwrap_or(std::path::Path::new("")).to_string_lossy().into_owned();
            let name_str = path_obj.file_name().unwrap_or_default().to_string_lossy().into_owned();
            
            let p_id = *parents_map.entry(parent_str.clone()).or_insert_with(|| {
                let id = parents_vec.len() as u32;
                parents_vec.push(parent_str);
                id
            });
            
            entries.push(DozipEntry {
                parent_id: p_id,
                name: name_str,
                is_dir: *is_dir,
            });
            idx += 1;
        }
    }

    let map = builder.into_map();
    Ok((map, DozipRegistry { parents: parents_vec, entries }))
}

pub fn reconstruct_path(registry: &DozipRegistry, entry: &DozipEntry) -> String {
    let parent = &registry.parents[entry.parent_id as usize];
    if parent.is_empty() {
        entry.name.clone()
    } else {
        format!("{}\\{}", parent, entry.name)
    }
}

