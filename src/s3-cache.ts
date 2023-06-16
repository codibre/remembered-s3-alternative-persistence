import { S3CacheOptions } from './s3-cache-options';
import { AlternativePersistence } from '@remembered/redis';
import { S3 } from '@aws-sdk/client-s3';
import { Redis } from 'ioredis';
import { EventEmitter } from 'events';
import TypedEmitter from 'typed-emitter';
import { S3CacheEvents } from './s3-cache-events';

interface AWSError {
	message: string;
	code: string;
	syscall: string;
}

const persistanceTypes: ['redis', 's3'] = ['redis', 's3'];

export interface S3Cache extends TypedEmitter<S3CacheEvents> {}
export class S3Cache
	implements AlternativePersistence, TypedEmitter<S3CacheEvents>
{
	constructor(
		private options: S3CacheOptions,
		private s3: S3,
		private redis?: Redis,
	) {}

	get maxSavingDelay() {
		return this.options.maxSavingDelay;
	}

	get maxResultsPerSave() {
		return this.options.maxResultsPerSave;
	}

	set maxResultsPerSave(value) {
		this.options.maxResultsPerSave = value;
	}

	private async _getFromRedis(
		key: string,
	): Promise<string | Buffer | null | undefined> {
		return this.redis?.getBuffer(key);
	}

	private async _saveOnRedis(key: string, content: string | Buffer) {
		if (this.options.transientTtl) {
			await this.redis?.setex(key, this.options.transientTtl, content);
		}
	}

	async save(key: string, content: string | Buffer): Promise<void> {
		const objectKey = this._getObjectKey(key);

		const params = {
			Body: content,
			Bucket: this.options.bucketName,
			Key: objectKey,
			ContentType: 'application/json',
		};

		const results = await Promise.allSettled([
			this._saveOnRedis(this._getRedisKey(objectKey), content),
			this.s3.putObject(params),
		]);

		results.forEach((x, index) => {
			if (x.status === 'rejected') {
				this.emit('saveError', 'Error while persisting cache', {
					persistenceType: persistanceTypes[index],
					errorMessage: x.reason.message,
					syscall: (x.reason as AWSError).syscall,
				});
			}
		});
	}

	async get(key: string): Promise<string | Buffer | undefined> {
		const s3Key = this._getObjectKey(key);
		const redisKey = this._getRedisKey(s3Key);
		try {
			const redisResult = await this._getFromRedis(redisKey);
			if (redisResult) {
				return redisResult;
			}
		} catch (err) {
			const error = err as AWSError;
			this.emit('fetchingError', 'error while fetching from redis', {
				persistenceType: 'redis',
				errorMessage: error.message,
			});
		}

		try {
			const params = {
				Bucket: this.options.bucketName,
				Key: s3Key,
			};

			const { Body } = await this.s3.getObject(params);
			if (Body) {
				const result = Buffer.from(await Body.transformToByteArray());
				if (result.length) {
					this._saveOnRedis(redisKey, result);
					return result;
				}
			}

			return undefined;
		} catch (err) {
			const error = err as AWSError;
			this.emit('fetchingError', 'error while fetching from S3', {
				persistenceType: 's3',
				errorMessage: error.message,
				syscall: error.syscall,
				code: error.code,
			});
			return undefined;
		}
	}

	private _getObjectKey(key: string): string {
		return `${this.options.prefix || 'cache'}/${key}.bin`;
	}

	private _getRedisKey(key: string) {
		return `${this.options.transientPrefix || 'transient'}:${key}`;
	}
}
Object.setPrototypeOf(S3Cache.prototype, EventEmitter.prototype);
Object.setPrototypeOf(S3Cache, EventEmitter);
