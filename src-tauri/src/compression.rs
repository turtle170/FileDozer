use std::fs::{self, File};
use std::io::{self, BufReader, BufWriter, Write};
use walkdir::WalkDir;
use std::path::{Path, PathBuf};
use rayon::prelude::*;

// ─── Dozip format ────────────────────────────────────────────────────────────
// Header: magic[4] | orig_size[8] | flags[1] | reserved[3] = 16 bytes
// flags bit 0 = lossy preprocessing applied
// Body: lz4 frame-compressed data

const DOZIP_MAGIC: &[u8; 4] = b"DZ\x01\x00";

#[derive(Debug, serde::Serialize)]
pub struct CompressResult {
    pub output_path: String,
    pub original_bytes: u64,
    pub compressed_bytes: u64,
    pub ratio: f32,
}

// ─── lossy text preprocessing ─────────────────────────────────────────────────
fn preprocess_lossy(data: &[u8]) -> Vec<u8> {
    let Ok(s) = std::str::from_utf8(data) else {
        return data.to_vec();
    };
    let mut out = String::with_capacity(s.len() / 2);
    let mut prev_space = false;
    for ch in s.chars() {
        if ch == '\r' { continue; }
        if ch == '\t' || ch == ' ' {
            if !prev_space { out.push(' '); }
            prev_space = true;
        } else {
            prev_space = false;
            out.push(ch);
        }
    }
    out.into_bytes()
}

// ─── Dozip compress ───────────────────────────────────────────────────────────
pub fn compress_dozip(input: &Path, output: &Path, lossy: bool) -> io::Result<CompressResult> {
    let mut files = Vec::new();
    let mut orig_size = 0u64;
    
    // 1. Gather files for Solid Archive
    if input.is_dir() {
        for entry in WalkDir::new(input).into_iter().filter_map(|e| e.ok()) {
            if entry.file_type().is_file() {
                let path = entry.path().to_path_buf();
                let rel = path.strip_prefix(input.parent().unwrap_or(input)).unwrap_or(&path).to_path_buf();
                files.push((path, rel));
            }
        }
    } else {
        let name = input.file_name().unwrap_or_default().to_string_lossy().into_owned();
        files.push((input.to_path_buf(), PathBuf::from(name)));
    }

    // 2. Build uncompressed solid payload with UT4 interception
    let mut solid_payload = Vec::new();
    for (path, rel) in files {
        let mut data = fs::read(&path)?;
        orig_size += data.len() as u64;

        let is_text = std::str::from_utf8(&data).is_ok();
        let mut is_ut4 = 0u8;

        if is_text {
            if lossy {
                data = preprocess_lossy(&data);
            }
            // Intercept text and downconvert to UT4
            let text = String::from_utf8_lossy(&data);
            data = crate::utf_tiny::encode(&text, "C");
            is_ut4 = 1;
        }

        let rel_str = rel.to_string_lossy().into_owned();
        let name_bytes = rel_str.as_bytes();
        
        solid_payload.write_all(&(name_bytes.len() as u16).to_le_bytes())?;
        solid_payload.write_all(name_bytes)?;
        solid_payload.write_all(&[is_ut4])?;
        solid_payload.write_all(&(data.len() as u64).to_le_bytes())?;
        solid_payload.write_all(&data)?;
    }

    // 3. Compress solid block with ZSTD Level 22 (Extreme Mode)
    let mut enc = zstd::stream::Encoder::new(Vec::new(), 22)?;
    let _ = enc.multithread(num_cpus::get() as u32);
    let _ = enc.long_distance_matching(true);
    let _ = enc.window_log(27);
    enc.write_all(&solid_payload)?;
    let compressed = enc.finish()?;

    let mut w = BufWriter::new(File::create(output)?);
    w.write_all(DOZIP_MAGIC)?;
    w.write_all(&orig_size.to_le_bytes())?;
    w.write_all(&[if lossy { 1u8 } else { 0u8 }, 0, 0, 0])?;
    w.write_all(&compressed)?;
    w.flush()?;

    let compressed_bytes = 16 + compressed.len() as u64;
    Ok(CompressResult {
        output_path: output.to_string_lossy().into_owned(),
        original_bytes: orig_size,
        compressed_bytes,
        ratio: if orig_size > 0 { compressed_bytes as f32 / orig_size as f32 } else { 1.0 },
    })
}

// ─── Dozip decompress ─────────────────────────────────────────────────────────
pub fn decompress_dozip(input: &Path, output: &Path) -> io::Result<()> {
    let raw = fs::read(input)?;
    if raw.len() < 16 || &raw[..4] != DOZIP_MAGIC {
        return Err(io::Error::new(io::ErrorKind::InvalidData, "Not a Dozip file"));
    }
    
    let _orig_size = u64::from_le_bytes(raw[4..12].try_into().unwrap());
    let body = &raw[16..];
    let decompressed = zstd::stream::decode_all(std::io::Cursor::new(body))?;
    
    let mut cursor = 0;
    while cursor < decompressed.len() {
        if cursor + 2 > decompressed.len() { break; }
        let name_len = u16::from_le_bytes(decompressed[cursor..cursor+2].try_into().unwrap()) as usize;
        cursor += 2;
        
        let name_bytes = &decompressed[cursor..cursor+name_len];
        let name = String::from_utf8_lossy(name_bytes).into_owned();
        cursor += name_len;
        
        let is_ut4 = decompressed[cursor];
        cursor += 1;
        
        let file_size = u64::from_le_bytes(decompressed[cursor..cursor+8].try_into().unwrap()) as usize;
        cursor += 8;
        
        let file_data = &decompressed[cursor..cursor+file_size];
        cursor += file_size;
        
        let out_path = output.join(&name);
        if let Some(parent) = out_path.parent() {
            fs::create_dir_all(parent)?;
        }
        
        let final_data = if is_ut4 == 1 {
            crate::utf_tiny::decode(file_data).unwrap_or_else(|_| String::new()).into_bytes()
        } else {
            file_data.to_vec()
        };
        fs::write(&out_path, final_data)?;
    }
    Ok(())
}

// ─── Generic File Compressors ────────────────────────────────────────────────
pub fn compress_file_single(input: &Path, output: &Path, format: &str) -> io::Result<CompressResult> {
    let data = fs::read(input)?;
    let orig_size = data.len() as u64;
    
    let file = File::create(output)?;
    let w = BufWriter::new(file);

    match format {
        "gz" => {
            use flate2::write::GzEncoder;
            let mut enc = GzEncoder::new(w, flate2::Compression::best());
            enc.write_all(&data)?;
            enc.finish()?;
        }
        "bz2" => {
            use bzip2::write::BzEncoder;
            let mut enc = BzEncoder::new(w, bzip2::Compression::best());
            enc.write_all(&data)?;
            enc.finish()?;
        }
        "xz" => {
            use xz2::write::XzEncoder;
            let mut enc = XzEncoder::new(w, 9);
            enc.write_all(&data)?;
            enc.finish()?;
        }
        "br" => {
            let mut enc = brotli::CompressorWriter::new(w, 4096, 11, 24);
            enc.write_all(&data)?;
        }
        "zst" => {
            let mut enc = zstd::stream::Encoder::new(w, 22)?;
            let _ = enc.multithread(num_cpus::get() as u32);
            let _ = enc.long_distance_matching(true);
            let _ = enc.window_log(27);
            enc.write_all(&data)?;
            enc.finish()?;
        }
        _ => return Err(io::Error::new(io::ErrorKind::InvalidInput, "Unknown format")),
    }

    let compressed_bytes = fs::metadata(output)?.len();
    Ok(CompressResult {
        output_path: output.to_string_lossy().into_owned(),
        original_bytes: orig_size,
        compressed_bytes,
        ratio: if orig_size > 0 { compressed_bytes as f32 / orig_size as f32 } else { 1.0 },
    })
}

pub fn compress_tar_archive(input_paths: &[PathBuf], output: &Path, format: &str) -> io::Result<CompressResult> {
    let file = BufWriter::with_capacity(1024 * 1024 * 4, File::create(output)?); // 4MB io buffer
    
    // Parallelize directory size calculation using ParIter
    let orig_size: u64 = input_paths.par_iter().map(|p| {
        if p.is_dir() { dir_size(p) } else { fs::metadata(p).map(|m| m.len()).unwrap_or(0) }
    }).sum();

    let build_tar = |writer: &mut dyn Write| -> io::Result<()> {
        let mut tar = tar::Builder::new(writer);
        for input in input_paths {
            if input.is_dir() {
                let name = input.file_name().unwrap_or_default().to_string_lossy().into_owned();
                tar.append_dir_all(&name, input)?;
            } else {
                let name = input.file_name().unwrap_or_default().to_string_lossy().into_owned();
                let mut f = File::open(input)?;
                tar.append_file(&name, &mut f)?;
            }
        }
        tar.finish()?;
        Ok(())
    };

    match format {
        "tar.bz2" => {
            use bzip2::write::BzEncoder;
            let mut enc = BzEncoder::new(file, bzip2::Compression::best());
            build_tar(&mut enc)?;
            enc.finish()?;
        }
        "tar.xz" => {
            use xz2::write::XzEncoder;
            let mut enc = XzEncoder::new(file, 9);
            build_tar(&mut enc)?;
            enc.finish()?;
        }
        "tar.zst" => {
            let mut enc = zstd::stream::Encoder::new(file, 22)?;
            let _ = enc.multithread(num_cpus::get() as u32);
            let _ = enc.long_distance_matching(true);
            let _ = enc.window_log(27);
            build_tar(&mut enc)?;
            enc.finish()?;
        }
        "tar.br" => {
            let mut enc = brotli::CompressorWriter::new(file, 4096, 11, 24);
            build_tar(&mut enc)?;
        }
        _ => return Err(io::Error::new(io::ErrorKind::InvalidInput, "Unknown format")),
    }

    let compressed_bytes = fs::metadata(output)?.len();
    Ok(CompressResult {
        output_path: output.to_string_lossy().into_owned(),
        original_bytes: orig_size,
        compressed_bytes,
        ratio: if orig_size > 0 { compressed_bytes as f32 / orig_size as f32 } else { 1.0 },
    })
}

// ─── ZIP ─────────────────────────────────────────────────────────────────────
pub fn compress_zip(input_paths: &[PathBuf], output: &Path) -> io::Result<CompressResult> {
    use zip::write::SimpleFileOptions;

    let file = BufWriter::new(File::create(output)?);
    let mut zip = zip::ZipWriter::new(file);
    let options = SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .compression_level(Some(9));

    let mut orig_size = 0u64;

    for input in input_paths {
        if input.is_dir() {
            for entry in WalkDir::new(input).into_iter().filter_map(|e| e.ok()) {
                let path = entry.path();
                let rel = path.strip_prefix(input.parent().unwrap_or(input)).unwrap_or(path);
                if path.is_file() {
                    zip.start_file(rel.to_string_lossy(), options)?;
                    let mut f = BufReader::new(File::open(path)?);
                    let written = io::copy(&mut f, &mut zip)?;
                    orig_size += written;
                } else if path.is_dir() {
                    zip.add_directory(format!("{}/", rel.to_string_lossy()), options)?;
                }
            }
        } else {
            let name = input.file_name().unwrap_or_default().to_string_lossy();
            zip.start_file(name, options)?;
            let mut f = BufReader::new(File::open(input)?);
            let written = io::copy(&mut f, &mut zip)?;
            orig_size += written;
        }
    }

    zip.finish()?;
    let compressed_bytes = fs::metadata(output)?.len();
    Ok(CompressResult {
        output_path: output.to_string_lossy().into_owned(),
        original_bytes: orig_size,
        compressed_bytes,
        ratio: if orig_size > 0 { compressed_bytes as f32 / orig_size as f32 } else { 1.0 },
    })
}

// ─── TAR.GZ ───────────────────────────────────────────────────────────────────
pub fn compress_tar_gz(input_paths: &[PathBuf], output: &Path) -> io::Result<CompressResult> {
    use flate2::write::GzEncoder;
    use flate2::Compression;

    let file = BufWriter::new(File::create(output)?);
    let gz = GzEncoder::new(file, Compression::best());
    let mut tar = tar::Builder::new(gz);
    let mut orig_size = 0u64;

    for input in input_paths {
        if input.is_dir() {
            let name = input.file_name().unwrap_or_default().to_string_lossy().into_owned();
            tar.append_dir_all(&name, input)?;
            orig_size += dir_size(input);
        } else {
            let name = input.file_name().unwrap_or_default().to_string_lossy().into_owned();
            let mut f = File::open(input)?;
            let size = f.metadata()?.len();
            tar.append_file(&name, &mut f)?;
            orig_size += size;
        }
    }

    tar.finish()?;
    let compressed_bytes = fs::metadata(output)?.len();
    Ok(CompressResult {
        output_path: output.to_string_lossy().into_owned(),
        original_bytes: orig_size,
        compressed_bytes,
        ratio: if orig_size > 0 { compressed_bytes as f32 / orig_size as f32 } else { 1.0 },
    })
}

// ─── 7Z (via 7z.exe subprocess) ──────────────────────────────────────────────
pub fn compress_7z(input_paths: &[PathBuf], output: &Path) -> io::Result<CompressResult> {
    let seven_z = find_7z()?;
    
    // Parallel calculation
    let orig_size: u64 = input_paths.par_iter().map(|p| {
        if p.is_dir() { dir_size(p) } else { fs::metadata(p).map(|m| m.len()).unwrap_or(0) }
    }).sum();

    let mut cmd = std::process::Command::new(&seven_z);
    cmd.arg("a").arg("-mx=9").arg("-mmt=on").arg(output);
    for p in input_paths { cmd.arg(p); }
    let status = cmd.status()?;
    if !status.success() {
        return Err(io::Error::new(io::ErrorKind::Other, "7z.exe returned non-zero exit code"));
    }

    let compressed_bytes = fs::metadata(output)?.len();
    Ok(CompressResult {
        output_path: output.to_string_lossy().into_owned(),
        original_bytes: orig_size,
        compressed_bytes,
        ratio: if orig_size > 0 { compressed_bytes as f32 / orig_size as f32 } else { 1.0 },
    })
}

fn find_7z() -> io::Result<PathBuf> {
    let candidates = [
        r"C:\Program Files\7-Zip\7z.exe",
        r"C:\Program Files (x86)\7-Zip\7z.exe",
        "7z.exe",
    ];
    for c in &candidates {
        let p = PathBuf::from(c);
        if p.exists() || (c == &"7z.exe") {
            return Ok(p);
        }
    }
    Err(io::Error::new(io::ErrorKind::NotFound, "7z.exe not found. Install 7-Zip from https://7-zip.org"))
}

// ─── Universal decompress ─────────────────────────────────────────────────────
pub fn decompress(input: &Path, output_dir: &Path) -> io::Result<()> {
    fs::create_dir_all(output_dir)?;
    let name = input.file_name().unwrap_or_default().to_string_lossy().to_lowercase();

    if name.ends_with(".dz") {
        let mut out = output_dir.to_path_buf();
        if input.is_file() {
            // decompress_dozip unpacks relative to the output_dir
            out = output_dir.to_path_buf();
        }
        return decompress_dozip(input, &out);
    }

    if name.ends_with(".zip") {
        let f = BufReader::new(File::open(input)?);
        let mut archive = zip::ZipArchive::new(f)?;
        archive.extract(output_dir)?;
        return Ok(());
    }

    if name.ends_with(".tar.gz") || name.ends_with(".tgz") {
        use flate2::read::GzDecoder;
        let f = BufReader::new(File::open(input)?);
        let gz = GzDecoder::new(f);
        let mut archive = tar::Archive::new(gz);
        archive.unpack(output_dir)?;
        return Ok(());
    }

    if name.ends_with(".tar") {
        let f = BufReader::new(File::open(input)?);
        let mut archive = tar::Archive::new(f);
        archive.unpack(output_dir)?;
        return Ok(());
    }

    if name.ends_with(".br") {
        let f = BufReader::new(File::open(input)?);
        let stem = input.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
        let mut tr = brotli::Decompressor::new(f, 4096);
        let mut out = File::create(output_dir.join(stem))?;
        io::copy(&mut tr, &mut out)?;
        return Ok(());
    }

    if name.ends_with(".zst") {
        let f = BufReader::new(File::open(input)?);
        let stem = input.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
        let mut out = File::create(output_dir.join(stem))?;
        zstd::stream::copy_decode(f, &mut out)?;
        return Ok(());
    }

    if name.ends_with(".bz2") || name.ends_with(".tar.bz2") || name.ends_with(".xz") || name.ends_with(".tar.xz") || name.ends_with(".7z") || name.ends_with(".gz") || name.ends_with(".tar") {
        if let Ok(seven_z) = find_7z() {
            let status = std::process::Command::new(seven_z)
                .args(["x", "-y", "-mmt=on"])
                .arg(format!("-o{}", output_dir.display()))
                .arg(input)
                .status()?;
            if !status.success() {
                return Err(io::Error::new(io::ErrorKind::Other, "7z extraction failed"));
            }
            return Ok(());
        }
    }

    Err(io::Error::new(io::ErrorKind::Unsupported, format!("Unsupported archive format: {}", name)))
}

// ─── helpers ─────────────────────────────────────────────────────────────────
fn dir_size(path: &Path) -> u64 {
    let entries: Vec<_> = WalkDir::new(path)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .collect();

    // Map the file lengths in parallel for raw speed
    entries.par_iter()
        .map(|e| e.metadata().map(|m| m.len()).unwrap_or(0))
        .sum()
}

pub fn auto_output_path(input: &Path, ext: &str) -> PathBuf {
    let stem = input.file_name().unwrap_or_default().to_string_lossy();
    input.parent().unwrap_or(Path::new(".")).join(format!("{}.{}", stem, ext))
}
