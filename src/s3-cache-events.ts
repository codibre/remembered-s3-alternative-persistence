export interface S3CacheSaveEventMetadata {
	persistenceType: 'redis' | 's3';
	errorMessage: string;
	syscall?: string;
	code?: string;
}

export type S3CacheEvents = {
	saveError: (message: string, meta: S3CacheSaveEventMetadata) => void;
	fetchingError: (message: string, meta: S3CacheSaveEventMetadata) => void;
	message: (body: string, from: string) => void;
};
