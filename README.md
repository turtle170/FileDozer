# FileDozer 🚜

**FileDozer** is a fast file search engine and extreme-compression archiver built for Windows. 
Powered by Rust 🦀 and Tauri, it bypasses standard OS bottlenecks to deliver fast file indexing and introduces a custom archive format (`.dz`) that pushes compression hardware to its absolute mathematical limits.

## ⚡ Core Features

### 1.Lightning Fast Desktop Search
* **Direct Windows API Integration**: Uses low-level `FindFirstFileExW` and NTFS Master File Table (MFT) scanning for zero-overhead directory traversal.
* **Zero-Copy Architecture**: Utilizes `Rayon` to parallelize data extraction while aggressively enforcing zero-copy memory patterns (e.g., in-place ASCII lowercasing).
* **In-Memory FST Index**: File structures are compiled into a highly dense Finite State Transducer (FST), locked into physical RAM (`VirtualLock`) for nanosecond query resolutions.

### 2. Extreme `.dz` (Dozip) Solid Archives
Standard `.zip` and `.tar.gz` leave compression on the table. The custom `.dz` format was built to squeeze every last byte from your drives:
* **Solid Block Serialization**: Strips file boundaries and bundles directory trees into a single, continuous binary payload.
* **Zstandard Level 22 (Max)**: Enforces Zstd's absolute highest compression barrier using multi-threaded execution (`zstdmt`) across all logical CPU cores.
* **128MB Long-Distance Matching**: Implements `window_log(27)` to detect and deduplicate redundant data across thousands of files hundreds of megabytes apart within the same archive.

### 3. UTF-Tiny V4 (UT4) Text Interception
FileDozer natively intercepts text and source code before compression and downconverts it into **UT4**—a bespoke encoding formulation:
* **Pre-Shared Static Dictionaries**: Bypasses traditional dictionary bloat by mapping the 128 most common programming keywords, punctuations, and English structures natively into the executable. 
* **1-Byte Perfect Bounding**: UT4 maps exactly 128 predefined tokens, perfectly exploiting the mathematical bounds of ULEB128 to ensure all common syntax costs exactly 1 Byte.
* **Sequence Run-Length Encoding (RLE)**: Repeated characters, blank spaces, or code indentations are squashed into coordinate bounds rather than serialized strings.
* **Caution:** UT4 makes some files tiny, but not all. Some small files (>0.5KB or 500B) may be slightly larger than UTF-8 versions. Since UT4 encoding is small, **UT4 cannot be used with notepad or any type of code. Only use UT4 for files only you want to view, like extremely large files.**

## Hardware Information
I ran everything on a i7-7700 with no GPU and 16 GB of dual-channel RAM at 2400 Mhz on Windows 11 IoT Enterprise LTSC 24H2. Don't worry, I know that LTSC has some requirements stripped down. I have added a dynamic requirement checker that ensures FileDozer runs on most Windows 11 systems.

It indexed 3.3TB in 39 seconds, with 200GB from a Lexar NM620 NVMe SSD. That was indexed in 4 seconds.

## ⚠️ Security precautions
FileDozer requires admin permissions to use the MFT of your drives to index them lightning fast.

Thus, if you are a non-admin, I strongly recommend you do not use FileDozer and use something else like Everything.


## 📦 Installation

I have included the standalone .exe and .msi files in this repo.

To finish installation, follow these instructions:

1. run the installer and open a terminal whe the installer has finished.
2. run `cd [Your FileDozer Installation Directory]`
3. run `npm install`
4. Done! You now have FileDozer installed.

## 🛠️ Stack
* **Backend Architecture**: Rust, Rayon, FST, Zstd, Mimalloc
* **Frontend / UI**: React, TypeScript, TailwindCSS, Tauri

## 🤝 Contributing
Pull requests are welcome! If you're passionate about low-level memory optimizations, compression algorithms, or UI design, jump in.

## 📄 License
MIT License
