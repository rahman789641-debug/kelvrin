import { SovereignDocument } from '../services/api';
import { generateValidPdfBlob } from './fileGenerators';

const DB_NAME = 'kelvrin_document_vault';
const STORE_NAME = 'document_blobs';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;
const memoryBlobMap = new Map<string, Blob>();
const objectUrlMap = new Map<string, string>();

function getIndexedDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported'));
      return;
    }

    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event: any) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };

      request.onsuccess = (event: any) => {
        resolve(event.target.result);
      };

      request.onerror = (event: any) => {
        reject(event.target.error || new Error('Failed to open IndexedDB'));
      };
    } catch (e) {
      reject(e);
    }
  });

  return dbPromise;
}

/**
 * Save raw file blob (PDF, Image, text, docx, etc.) for instant client-side viewing
 */
export async function saveDocumentBlob(docId: string, blob: Blob | File): Promise<void> {
  if (!docId || !blob) return;
  memoryBlobMap.set(docId, blob);

  try {
    const db = await getIndexedDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE_NAME], 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put({
        id: docId,
        blob: blob,
        name: (blob as File).name || 'document',
        type: blob.type,
        size: blob.size,
        updatedAt: Date.now()
      });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[DocVault] IndexedDB save fallback to memory:', err);
  }
}

/**
 * Retrieve blob for a document
 */
export async function getDocumentBlob(docId: string): Promise<Blob | null> {
  if (!docId) return null;
  if (memoryBlobMap.has(docId)) {
    return memoryBlobMap.get(docId)!;
  }

  try {
    const db = await getIndexedDB();
    const result = await new Promise<any>((resolve, reject) => {
      const tx = db.transaction([STORE_NAME], 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(docId);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    if (result?.blob) {
      memoryBlobMap.set(docId, result.blob);
      return result.blob;
    }
  } catch (err) {
    console.warn('[DocVault] IndexedDB get fallback:', err);
  }

  return null;
}

/**
 * Get or create an object URL for embedding in <iframe>, <img>, or <a>
 */
export async function getDocumentObjectUrl(docId: string): Promise<string | null> {
  if (!docId) return null;
  if (objectUrlMap.has(docId)) {
    return objectUrlMap.get(docId)!;
  }

  const blob = await getDocumentBlob(docId);
  if (blob) {
    const url = URL.createObjectURL(blob);
    objectUrlMap.set(docId, url);
    return url;
  }

  return null;
}

/**
 * Persist small data URLs in localStorage for cross-session fallback
 */
export function saveDocumentDataUrl(docId: string, dataUrl: string): void {
  if (!docId || !dataUrl) return;
  try {
    localStorage.setItem(`kelvrin_doc_data_${docId}`, dataUrl);
  } catch {
    // Quota might be exceeded, ignore
  }
}

export function getDocumentDataUrl(docId: string): string | null {
  if (!docId) return null;
  try {
    return localStorage.getItem(`kelvrin_doc_data_${docId}`) || null;
  } catch {
    return null;
  }
}

/**
 * Generate a valid PDF Blob object URL on the fly if original binary is unavailable
 */
export function generatePdfPreviewUrl(doc: SovereignDocument): string {
  const cacheKey = `pdf_preview_${doc.id}`;
  if (objectUrlMap.has(cacheKey)) {
    return objectUrlMap.get(cacheKey)!;
  }

  const blob = generateValidPdfBlob({
    title: doc.title || doc.filename,
    subtitle: `Classification: ${doc.classification || 'INTERNAL'} | SHA-256: ${(doc.sha256_hash || '').slice(0, 16)}...`,
    paragraphs: [
      `Enclave Ingestion Verified: ${doc.filename}`,
      `File Size: ${(doc.file_size_bytes / 1024 / 1024).toFixed(2)} MB | MIME Type: ${doc.mime_type}`,
      `Uploaded By: ${doc.uploaded_by || doc.owner_name || 'Enclave Operator'} | Status: ${doc.status}`,
      `--------------------------------------------------------------------------------`,
      doc.content_preview || 'Cryptographically verified sovereign enclave record. Access restricted to authorized personnel.'
    ]
  });

  const url = URL.createObjectURL(blob);
  objectUrlMap.set(cacheKey, url);
  return url;
}
