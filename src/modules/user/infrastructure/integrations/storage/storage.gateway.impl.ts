import {
    StorageGateway,
} from "../../../domain/gateways/storage.gateway";

export interface StorageService {
    upload(
        file: Buffer,
        options: {
            folder: string;
            filename: string;
            contentType: string;
        },
    ): Promise<{
        url: string;
        key: string;
    }>;

    delete(
        key: string,
    ): Promise<void>;
}

export class StorageGatewayImpl
    implements StorageGateway {
    constructor(
        private readonly storageService: StorageService,
    ) { }

    async uploadAvatar(
        userId: number,
        file: Buffer,
        contentType: string,
    ) {
        return this.storageService.upload(
            file,
            {
                folder: `users/${userId}/avatar`,
                filename: "avatar",
                contentType,
            },
        );
    }

    async delete(
        key: string,
    ): Promise<void> {
        await this.storageService.delete(key);
    }
}