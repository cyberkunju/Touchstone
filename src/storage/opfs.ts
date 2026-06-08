/**
 * Origin Private File System (OPFS) storage manager.
 * Provides client-side, sandboxed, high-performance binary storage for
 * document images, cropped visual assets, and downloaded ONNX models.
 */

/**
 * Gets a directory handle inside the OPFS sandbox.
 */
async function getDirectoryHandle(dirName: string, create = true): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return await root.getDirectoryHandle(dirName, { create });
}

/**
 * Writes a binary blob to the specified directory in OPFS.
 */
export async function writeOPFSFile(dirName: string, fileName: string, data: Blob | ArrayBuffer): Promise<string> {
  const dirHandle = await getDirectoryHandle(dirName, true);
  const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(data);
  await writable.close();
  return `${dirName}/${fileName}`;
}

/**
 * Reads a file as a Blob from OPFS.
 */
export async function readOPFSFile(dirName: string, fileName: string): Promise<File> {
  const dirHandle = await getDirectoryHandle(dirName, false);
  const fileHandle = await dirHandle.getFileHandle(fileName);
  return await fileHandle.getFile();
}

/**
 * Deletes a file from OPFS.
 */
export async function deleteOPFSFile(dirName: string, fileName: string): Promise<void> {
  const dirHandle = await getDirectoryHandle(dirName, false);
  await dirHandle.removeEntry(fileName);
}

/**
 * Checks if a file exists inside the specified OPFS directory.
 */
export async function existsOPFSFile(dirName: string, fileName: string): Promise<boolean> {
  try {
    const dirHandle = await getDirectoryHandle(dirName, false);
    await dirHandle.getFileHandle(fileName);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Lists all file names inside a specific OPFS directory.
 */
export async function listOPFSFiles(dirName: string): Promise<string[]> {
  try {
    const dirHandle = await getDirectoryHandle(dirName, false);
    const files: string[] = [];
    // Iterate over directory entries
    for await (const name of (dirHandle as any).keys()) {
      files.push(name);
    }
    return files;
  } catch (error) {
    return [];
  }
}

/**
 * Clears an entire OPFS directory recursively.
 */
export async function clearOPFSDirectory(dirName: string): Promise<void> {
  try {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry(dirName, { recursive: true });
  } catch (error) {
    // Directory might not exist, ignore
  }
}
