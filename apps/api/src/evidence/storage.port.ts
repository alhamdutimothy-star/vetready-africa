/** Deferred private-storage boundary. No provider, endpoint, upload or URL implementation. */
export interface EvidenceStoragePort {
  inspect(reference: { objectId: string; candidateId: string }): Promise<{
    objectId: string;
    candidateId: string;
    mediaType: string;
    byteLength: number;
    sha256: string;
    disposition: 'QUARANTINED' | 'CLEAN' | 'REJECTED';
  }>;
  /** Future adapter must authorize ownership and quarantine status before streaming. */
  readPrivate(reference: {
    objectId: string;
    candidateId: string;
  }): Promise<AsyncIterable<Uint8Array>>;
}
