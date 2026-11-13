import {
    NotificationGateway,
} from "../../../domain/gateways/notification.gateway";

export interface NotificationService {
    send(input: {
        recipientId: number;
        type: string;
        data?: Record<string, unknown>;
    }): Promise<void>;
}

export class NotificationGatewayImpl
    implements NotificationGateway {
    constructor(
        private readonly notificationService: NotificationService,
    ) { }

    async notifyUserCreated(
        userId: number,
    ): Promise<void> {
        await this.notificationService.send({
            recipientId: userId,
            type: "USER_CREATED",
        });
    }

    async notifyUserActivated(
        userId: number,
    ): Promise<void> {
        await this.notificationService.send({
            recipientId: userId,
            type: "USER_ACTIVATED",
        });
    }

    async notifyUserDeactivated(
        userId: number,
    ): Promise<void> {
        await this.notificationService.send({
            recipientId: userId,
            type: "USER_DEACTIVATED",
        });
    }
}