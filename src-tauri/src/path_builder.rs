use std::collections::HashMap;
use rayon::prelude::*;
use crate::ntfs_scanner::RawEntry;

const NTFS_ROOT_ID: u64 = 5;

pub fn build_paths(entries: Vec<RawEntry>) -> Vec<(String, String, bool)> {
    let id_to_idx: HashMap<u64, usize> = entries
        .iter()
        .enumerate()
        .map(|(i, e)| (e.file_id, i))
        .collect();

    let mut resolved: HashMap<u64, String> = HashMap::with_capacity(entries.len() + 1);
    resolved.insert(NTFS_ROOT_ID, "C:".to_string());

    for entry in &entries {
        resolve(&entry.file_id, &entry.name, &entry.parent_id, &id_to_idx, &entries, &mut resolved);
    }

    let resolved_ref = &resolved;
    let mut result: Vec<(String, String, bool)> = entries
        .par_iter()
        .map(|e| {
            let path = resolved_ref.get(&e.file_id).cloned().unwrap_or_else(|| format!("C:\\{}", e.name));
            let mut lower = path.clone();
            lower.make_ascii_lowercase();
            (lower, path, e.is_dir)
        })
        .collect();

    result.par_sort_unstable_by(|a, b| a.0.cmp(&b.0));
    result
}

fn resolve<'a>(
    file_id: &u64,
    name: &str,
    parent_id: &u64,
    id_to_idx: &HashMap<u64, usize>,
    entries: &[RawEntry],
    resolved: &'a mut HashMap<u64, String>,
) -> String {
    if let Some(cached) = resolved.get(file_id) {
        return cached.clone();
    }

    let parent_path = if *parent_id == NTFS_ROOT_ID || *parent_id == *file_id {
        "C:".to_string()
    } else if let Some(cached) = resolved.get(parent_id) {
        cached.clone()
    } else if let Some(&pidx) = id_to_idx.get(parent_id) {
        let pe = &entries[pidx];
        let pp = resolve(&pe.file_id, &pe.name, &pe.parent_id, id_to_idx, entries, resolved);
        resolved.insert(*parent_id, pp.clone());
        pp
    } else {
        "C:".to_string()
    };

    let full = format!("{}\\{}", parent_path, name);
    resolved.insert(*file_id, full.clone());
    full
}
