export interface S3CacheOptions {
	bucketName: string;
	maxSavingDelay: number;
	prefix?: string;
	transientPrefix?: string;
	transientTtl: number;
}
