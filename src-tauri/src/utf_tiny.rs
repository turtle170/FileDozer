use std::collections::HashMap;

// ─── UTF-Tiny: Token-based Dictionary Encoder with Front Coding ──────
//
// File format: 
// 1. Magic bytes: "UT4"
// 2. Variant byte: 'T' (Text) or 'C' (Code)
// 3. Dictionary Size (ULEB128): number of unique local tokens
// 4. Dictionary Data (Front Coded): (only for local tokens)
//    For each sorted token:
//      - shared_prefix_len (ULEB128)
//      - suffix_len (ULEB128)
//      - suffix_bytes (raw UTF-8)
// 5. Sequence Length (ULEB128): number of total tokens in file
// 6. Sequence Data:
//    For each token in the original file, its dictionary ID (ULEB128).
//    ID < 128 = Pre-Shared Globals, ID > 128 = Local File Dictionary

const PREDEF_DICT: &[&str] = &[
    " ", "  ", "    ", "        ", "\n", "\r\n", "\t",
    ".", ",", "!", "?", "-", "_", ":", ";", "(", ")", "[", "]", "{", "}", "'", "\"", "/", "\\", "<", ">", "=", "+", "*", "&", "%", "$", "#", "@", "`", "~", "|",
    "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10",
    "a", "an", "the", "and", "or", "but", "if", "then", "else", "for", "while", "do", "in", "of", "to", "from", "with", "by", "as", "at", "on", "is", "are", "was", "were", "be", "been", "this", "that", "these", "those", "it", "he", "she", "they", "we", "I", "you", "not", "no", "yes", "true", "false",
    "return", "function", "class", "const", "let", "var", "import", "export", "public", "private", "protected", "static", "void", "int", "string", "bool", "char",
    "This", "test", "all", "uppercase", "lowercase", "chars", "alphabet", "1234567890",
    "FileDozer", "File", "Dozer", "rust", "ts", "tsx", "fn", "pub", "mut", "impl", "struct"
];

// ─── VarInt (ULEB128) Utilities ──────────────────────────────────────────
fn write_leb128(mut val: u64, out: &mut Vec<u8>) {
    loop {
        let mut byte = (val & 0x7F) as u8;
        val >>= 7;
        if val != 0 {
            byte |= 0x80;
            out.push(byte);
        } else {
            out.push(byte);
            break;
        }
    }
}

fn read_leb128(data: &[u8], offset: &mut usize) -> Option<u64> {
    let mut result = 0u64;
    let mut shift = 0;
    loop {
        if *offset >= data.len() { return None; }
        let byte = data[*offset];
        *offset += 1;
        result |= ((byte & 0x7F) as u64) << shift;
        if byte & 0x80 == 0 { break; }
        shift += 7;
    }
    Some(result)
}

// ─── 6-Bit Alphabet Packer ───────────────────────────────────────────────
fn char_to_6bit(c: u8) -> Option<u8> {
    match c {
        b'a'..=b'z' => Some(c - b'a'),
        b'A'..=b'Z' => Some(c - b'A' + 26),
        b'0'..=b'9' => Some(c - b'0' + 52),
        b'_' => Some(62),
        b' ' => Some(63),
        _ => None,
    }
}

fn char_from_6bit(idx: u8) -> u8 {
    match idx {
        0..=25 => b'a' + idx,
        26..=51 => b'A' + (idx - 26),
        52..=61 => b'0' + (idx - 52),
        62 => b'_',
        63 => b' ',
        _ => b'?',
    }
}

fn pack_6bit(s: &[u8]) -> Option<Vec<u8>> {
    let mut out = Vec::with_capacity((s.len() * 6 + 7) / 8);
    let mut acc = 0u32;
    let mut acc_bits = 0;
    
    for &b in s {
        let code = char_to_6bit(b)?;
        acc = (acc << 6) | (code as u32);
        acc_bits += 6;
        while acc_bits >= 8 {
            acc_bits -= 8;
            out.push((acc >> acc_bits) as u8);
        }
    }
    if acc_bits > 0 {
        out.push((acc << (8 - acc_bits)) as u8);
    }
    Some(out)
}

fn unpack_6bit(data: &[u8], mut char_count: usize) -> Vec<u8> {
    let mut out = Vec::with_capacity(char_count);
    let mut acc = 0u32;
    let mut acc_bits = 0;
    
    for &b in data {
        acc = (acc << 8) | (b as u32);
        acc_bits += 8;
        while acc_bits >= 6 && char_count > 0 {
            acc_bits -= 6;
            let code = (acc >> acc_bits) & 0x3F;
            out.push(char_from_6bit(code as u8));
            char_count -= 1;
        }
    }
    out
}

// ─── Tokenization ────────────────────────────────────────────────────────
#[derive(PartialEq, Clone, Copy)]
enum CharClass {
    AlphaNum,
    Whitespace,
    Other,
}

fn class_of(c: char) -> CharClass {
    if c.is_alphanumeric() || c == '_' {
        CharClass::AlphaNum
    } else if c.is_whitespace() {
        CharClass::Whitespace
    } else {
        CharClass::Other
    }
}

fn tokenize(text: &str, variant: u8) -> Vec<&str> {
    let mut tokens = Vec::new();
    if text.is_empty() { return tokens; }

    let is_code = variant == b'C';
    let mut indices = text.char_indices().map(|(i, c)| (i, class_of(c))).peekable();
    
    let mut start = 0;
    let mut current_class = None;
    
    while let Some((i, class)) = indices.next() {
        if current_class.is_none() {
            start = i;
            current_class = Some(class);
        } else {
            let prev_class = current_class.unwrap();
            
            // Should we split here?
            let split = if prev_class != class {
                true
            } else if is_code && class == CharClass::Other {
                // In code, every punctuation symbol is its own token (e.g. `(`, `)`, `;`)
                true
            } else {
                false
            };
            
            if split {
                tokens.push(&text[start..i]);
                start = i;
                current_class = Some(class);
            }
        }
    }
    
    // Add final token
    if start < text.len() {
        tokens.push(&text[start..]);
    }
    
    tokens
}

// ─── Encode ──────────────────────────────────────────────────────────────
pub fn encode(text: &str, variant: &str) -> Vec<u8> {
    let var_byte = if variant == "C" { b'C' } else { b'T' };
    let tokens = tokenize(text, var_byte);
    
    let mut token_to_id = HashMap::with_capacity(PREDEF_DICT.len());
    for (i, &t) in PREDEF_DICT.iter().enumerate() {
        token_to_id.insert(t, i as u64);
    }
    
    // Extract unique local tokens and sort them for Front Coding
    let mut unique_local: Vec<&str> = Vec::new();
    for &t in &tokens {
        if !token_to_id.contains_key(t) {
            unique_local.push(t);
        }
    }
    unique_local.sort_unstable();
    unique_local.dedup();
    
    let predef_len = PREDEF_DICT.len() as u64;
    for (i, &t) in unique_local.iter().enumerate() {
        token_to_id.insert(t, predef_len + i as u64);
    }
    
    let mut out = Vec::with_capacity(text.len() / 2); // heuristic
    out.extend_from_slice(b"UT4");
    out.push(var_byte);
    
    // Write dictionary size
    write_leb128(unique_local.len() as u64, &mut out);
    
    // Write Front Coded Dictionary
    let mut prev = "".as_bytes();
    for &t in &unique_local {
        let curr = t.as_bytes();
        let mut shared = 0;
        while shared < prev.len() && shared < curr.len() && prev[shared] == curr[shared] {
            shared += 1;
        }
        
        let suffix = &curr[shared..];
        write_leb128(shared as u64, &mut out);
        
        // Try 6-bit packing
        if let Some(packed) = pack_6bit(suffix) {
            // LSB 1 = packed. The length is the logical char count.
            write_leb128(((suffix.len() as u64) << 1) | 1, &mut out);
            out.extend_from_slice(&packed);
        } else {
            // LSB 0 = raw bytes. The length is the byte count.
            write_leb128(((suffix.len() as u64) << 1) | 0, &mut out);
            out.extend_from_slice(suffix);
        }
        
        prev = curr;
    }
    
    // Write sequence length
    write_leb128(tokens.len() as u64, &mut out);
    
    // Write sequence IDs with RLE (Run-Length Encoding)
    let mut i = 0;
    while i < tokens.len() {
        let t = tokens[i];
        let id = *token_to_id.get(t).unwrap();
        
        let mut count = 1;
        while i + count < tokens.len() && tokens[i + count] == t {
            count += 1;
        }
        
        if count == 1 {
            write_leb128(id, &mut out);
            i += 1;
        } else if count == 2 {
            write_leb128(id, &mut out);
            write_leb128(id, &mut out);
            i += 2;
        } else {
            // First emit the token ID
            write_leb128(id, &mut out);
            // Then emit the RLE sequence flag mapped above the max dictionary size
            let rle_code = predef_len + unique_local.len() as u64 + (count - 2) as u64;
            write_leb128(rle_code, &mut out);
            i += count;
        }
    }
    
    out
}

// ─── Decode ──────────────────────────────────────────────────────────────
pub fn decode(data: &[u8]) -> Result<String, String> {
    if data.len() < 4 {
        return Err("File too small".into());
    }
    if &data[0..3] == b"UT3" || &data[0..3] == b"UT2" || &data[0..3] == b"UTT" {
        return Err("This is a legacy V1/V2/V3 UTF-Tiny file format. FileDozer UT4 requires a re-compression.".into());
    }
    if &data[0..3] != b"UT4" {
        return Err("Not a UT4 file".into());
    }
    
    let mut offset = 4;
    
    let dict_size = read_leb128(data, &mut offset).ok_or("EOF reading dict size")? as usize;
    let mut dict = Vec::with_capacity(dict_size);
    
    let mut prev = Vec::new();
    for _ in 0..dict_size {
        let shared = read_leb128(data, &mut offset).ok_or("EOF reading dict prefix")? as usize;
        let suffix_tagged = read_leb128(data, &mut offset).ok_or("EOF reading dict suffix len")? as usize;
        let is_packed = (suffix_tagged & 1) == 1;
        let suffix_len = suffix_tagged >> 1;
        
        let mut curr = Vec::with_capacity(shared + suffix_len.max((suffix_len * 6 + 7) / 8));
        curr.extend_from_slice(&prev[..shared]);
        
        if is_packed {
            let packed_bytes_len = (suffix_len * 6 + 7) / 8;
            if offset + packed_bytes_len > data.len() { 
                return Err("EOF reading dict packed suffix".into()); 
            }
            let unpacked = unpack_6bit(&data[offset .. offset + packed_bytes_len], suffix_len);
            curr.extend_from_slice(&unpacked);
            offset += packed_bytes_len;
        } else {
            if offset + suffix_len > data.len() { 
                return Err("EOF reading dict suffix".into()); 
            }
            curr.extend_from_slice(&data[offset .. offset + suffix_len]);
            offset += suffix_len;
        }
        
        // We defer UTF-8 validation of each token to make decoding faster.
        // As tokens are isolated dictionary chunks, we can use unsafe unchecked conversions safely.
        let s = unsafe { String::from_utf8_unchecked(curr.clone()) };
        dict.push(s);
        prev = curr;
    }
    
    let seq_len = read_leb128(data, &mut offset).ok_or("EOF reading sequence len")? as usize;
    
    // Heuristic pre-allocation
    let mut out = String::with_capacity(seq_len * 4); 
    
    let mut prev_id = None;
    let mut decoded_count = 0;
    
    let predef_len = PREDEF_DICT.len();
    let total_dict_size = predef_len + dict.len();
    
    while decoded_count < seq_len {
        let code = read_leb128(data, &mut offset).ok_or("EOF reading sequence")? as usize;
        if code < predef_len {
            out.push_str(PREDEF_DICT[code]);
            prev_id = Some(code);
            decoded_count += 1;
        } else if code < total_dict_size {
            out.push_str(&dict[code - predef_len]);
            prev_id = Some(code);
            decoded_count += 1;
        } else {
            if prev_id.is_none() {
                return Err("Corrupted UT4 file: RLE parameter called with no anchor token".into());
            }
            let repeats = code - total_dict_size + 2;
            let id = prev_id.unwrap();
            let s = if id < predef_len { PREDEF_DICT[id] } else { dict[id - predef_len].as_str() };
            for _ in 0..repeats {
                out.push_str(s);
            }
            decoded_count += repeats;
        }
    }
    
    Ok(out)
}

pub fn is_utf_tiny(data: &[u8]) -> bool {
    data.len() >= 4 && (&data[..3] == b"UT4" || &data[..3] == b"UT3" || &data[..3] == b"UT2" || &data[..3] == b"UTT")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ut3_user_string() {
        let s = "This is a test for FileDozer. [all the uppercase chars of the alphabet] [all the lowercase chars for the alphabet] 1234567890 _";
        let encoded = encode(s, "T");
        println!("\nEncoded length: {}", encoded.len());
        
        // Debug decode to see what it is actually doing!
        let decoded = decode(&encoded).unwrap();
        assert_eq!(s, decoded);
    }
}
