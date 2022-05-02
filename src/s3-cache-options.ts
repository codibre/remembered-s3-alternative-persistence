export interface S3CacheOptions {
	bucketName: string;
	maxSavingDelay: number;
	maxResultsPerSave?: number;
	prefix?: string;
	transientPrefix?: string;
	transientTtl: number;
}
