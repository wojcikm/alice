export interface Document {
    uuid: string;
    source_uuid: string;
    conversation_uuid: string;
    text: string;
    metadata: DocumentMetadata;
    created_at: string;
    updated_at: string;
}

export interface DocumentMetadata {
    uuid: string;
    source_uuid?: string; // uuid of the source document — only used for chunks
    conversation_uuid?: string;
    name?: string;
    description?: string;

    tokens: number;
    chunk_index?: number;
    total_chunks?: number;

    type: 'audio' | 'text' | 'image' | 'document';
    content_type: 'chunk' | 'full' | 'memory';
    
    source?: string; // url or file path
    mimeType?: string;
    headers?: Record<string, string[]>;
    urls?: string[];
    images?: string[];
    screenshots?: string[];
    should_index?: boolean;
    updated_at?: string;
    category?: string;
    subcategory?: string;
} 