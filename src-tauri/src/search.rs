use fst::{IntoStreamer, Map, Streamer};
use fst::automaton::Subsequence;
use strsim::jaro_winkler;
use crate::index::{DozipRegistry, reconstruct_path};

#[derive(serde::Serialize, Clone)]
pub struct SearchResult {
    pub path: String,
    pub is_dir: bool,
}

#[derive(serde::Serialize, Clone)]
pub struct SearchResponse {
    pub results: Vec<SearchResult>,
    pub suggestions: Vec<SearchResult>,
    pub is_fuzzy: bool,
}

pub fn search_full(
    map: &Map<Vec<u8>>,
    registry: &DozipRegistry,
    query: &str,
    limit: usize,
) -> SearchResponse {
    if query.is_empty() {
        return SearchResponse { results: vec![], suggestions: vec![], is_fuzzy: false };
    }

    let exact = search_index(map, registry, query, limit);

    if !exact.is_empty() {
        return SearchResponse { results: exact, suggestions: vec![], is_fuzzy: false };
    }

    if query.len() < 2 {
        return SearchResponse { results: vec![], suggestions: vec![], is_fuzzy: false };
    }

    let suggestions = fuzzy_fallback(registry, query, 8);
    SearchResponse { results: vec![], suggestions, is_fuzzy: true }
}

fn search_index(map: &Map<Vec<u8>>, registry: &DozipRegistry, query: &str, limit: usize) -> Vec<SearchResult> {
    let q_lower = query.to_lowercase();
    let auto = Subsequence::new(&q_lower);
    let mut stream = map.search(auto).into_stream();
    let mut results = Vec::with_capacity(limit);

    while let Some((_key, idx)) = stream.next() {
        if results.len() >= limit {
            break;
        }
        if let Some(entry) = registry.entries.get(idx as usize) {
            results.push(SearchResult { path: reconstruct_path(registry, entry), is_dir: entry.is_dir });
        }
    }
    results
}

fn fuzzy_fallback(registry: &DozipRegistry, query: &str, limit: usize) -> Vec<SearchResult> {
    let q_lower = query.to_lowercase();

    let mut scored: Vec<(f64, &crate::index::DozipEntry)> = registry.entries
        .iter()
        .filter_map(|entry| {
            let score = jaro_winkler(&q_lower, &entry.name.to_lowercase());
            if score >= 0.7 { Some((score, entry)) } else { None }
        })
        .collect();

    scored.sort_unstable_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
    scored.truncate(limit);
    scored.into_iter().map(|(_, e)| SearchResult { path: reconstruct_path(registry, e), is_dir: e.is_dir }).collect()
}
