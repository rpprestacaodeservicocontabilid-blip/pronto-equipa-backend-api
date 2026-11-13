import { ProfileType } from "../enums/profile-type.enum";
import { Avatar } from "../value-objects/avatar.vo";
import { Phone } from "../value-objects/phone.vo";
import { DomainEvent } from "../../application/ports/event-publisher";

export interface UserProfileProps {
    id: number;
    userId: number;

    type: ProfileType;

    firstName: string;
    lastName: string | null;

    displayName: string | null;

    phone: Phone | null;

    avatar: Avatar | null;

    coverImage: string | null;

    bio: string | null;

    address: string | null;

    website: string | null;

    cityId: number | null;
    provinceId: number | null;
    countryId: number | null;

    dateOfBirth: Date | null;

    createdAt: Date;
    updatedAt: Date;
}

export class UserProfile {
    private readonly _id: number;
    private readonly _userId: number;

    private _type: ProfileType;

    private _firstName: string;
    private _lastName: string | null;
    private _displayName: string | null;

    private _phone: Phone | null;
    private _avatar: Avatar | null;

    private _coverImage: string | null;

    private _bio: string | null;

    private _address: string | null;
    private _website: string | null;

    private _cityId: number | null;
    private _provinceId: number | null;
    private _countryId: number | null;

    private _dateOfBirth: Date | null;

    private readonly _createdAt: Date;
    private _updatedAt: Date;

    private constructor(
        props: UserProfileProps,
    ) {
        // ID zero marks a new profile whose ID will be assigned by the database.
        if (props.id < 0) {
            throw new Error(
                "Profile ID cannot be negative.",
            );
        }

        if (props.userId <= 0) {
            throw new Error(
                "User ID must be greater than zero.",
            );
        }

        if (!props.firstName?.trim()) {
            throw new Error(
                "First name is required.",
            );
        }

        this._id = props.id;
        this._userId = props.userId;

        this._type = props.type;

        this._firstName =
            props.firstName.trim();

        this._lastName =
            props.lastName?.trim() || null;

        this._displayName =
            props.displayName?.trim() || null;

        this._phone = props.phone;
        this._avatar = props.avatar;

        this._coverImage =
            props.coverImage?.trim() || null;

        this._bio =
            props.bio?.trim() || null;

        this._address =
            props.address?.trim() || null;

        this._website =
            props.website?.trim() || null;

        this._cityId = props.cityId;
        this._provinceId = props.provinceId;
        this._countryId = props.countryId;

        this._dateOfBirth =
            props.dateOfBirth;

        this._createdAt = props.createdAt;
        this._updatedAt = props.updatedAt;
    }

    public static create(
        props: UserProfileProps,
    ): UserProfile {
        return new UserProfile(props);
    }

    public updateName(
        firstName: string,
        lastName?: string | null,
    ): void {
        if (!firstName?.trim()) {
            throw new Error(
                "First name is required.",
            );
        }

        this._firstName =
            firstName.trim();

        this._lastName =
            lastName?.trim() || null;

        this.touch();
    }

    public updateDisplayName(
        displayName: string | null,
    ): void {
        this._displayName =
            displayName?.trim() || null;

        this.touch();
    }

    public updatePhone(
        phone: Phone | null,
    ): void {
        this._phone = phone;
        this.touch();
    }

    public updateAvatar(
        avatar: Avatar | null,
    ): void {
        this._avatar = avatar;
        this.touch();
    }

    public updateCoverImage(
        coverImage: string | null,
    ): void {
        this._coverImage =
            coverImage?.trim() || null;
        this.touch();
    }

    public updateAddress(
        address: string | null,
    ): void {
        this._address =
            address?.trim() || null;
        this.touch();
    }

    public updateWebsite(
        website: string | null,
    ): void {
        this._website =
            website?.trim() || null;
        this.touch();
    }

    public updateBio(
        bio: string | null,
    ): void {
        this._bio =
            bio?.trim() || null;

        this.touch();
    }

    public updateLocation(
        cityId: number | null,
        provinceId: number | null,
        countryId: number | null,
    ): void {
        this._cityId = cityId;
        this._provinceId = provinceId;
        this._countryId = countryId;

        this.touch();
    }

    public updateDateOfBirth(
        dateOfBirth: Date | null,
    ): void {
        this._dateOfBirth = dateOfBirth;
        this.touch();
    }

    public update(input: {
        firstName?: string;
        lastName?: string | null;
        displayName?: string | null;
        phone?: Phone | null;
        avatar?: Avatar | null;
        coverImage?: string | null;
        bio?: string | null;
        address?: string | null;
        website?: string | null;
        cityId?: number | null;
        provinceId?: number | null;
        countryId?: number | null;
        dateOfBirth?: Date | null;
    }): void {
        if (input.firstName !== undefined) {
            this.updateName(input.firstName, input.lastName);
        }

        if (input.displayName !== undefined) {
            this.updateDisplayName(input.displayName);
        }

        if (input.phone !== undefined) {
            this.updatePhone(input.phone);
        }

        if (input.avatar !== undefined) {
            this.updateAvatar(input.avatar);
        }

        if (input.coverImage !== undefined) {
            this.updateCoverImage(input.coverImage);
        }

        if (input.bio !== undefined) {
            this.updateBio(input.bio);
        }

        if (input.address !== undefined) {
            this.updateAddress(input.address);
        }

        if (input.website !== undefined) {
            this.updateWebsite(input.website);
        }

        if (
            input.cityId !== undefined ||
            input.provinceId !== undefined ||
            input.countryId !== undefined
        ) {
            this.updateLocation(
                input.cityId ?? this._cityId,
                input.provinceId ?? this._provinceId,
                input.countryId ?? this._countryId,
            );
        }

        if (input.dateOfBirth !== undefined) {
            this.updateDateOfBirth(input.dateOfBirth);
        }
    }

    private touch(): void {
        this._updatedAt = new Date();
    }

    public get id(): number {
        return this._id;
    }

    public get userId(): number {
        return this._userId;
    }

    public get type(): ProfileType {
        return this._type;
    }

    public get firstName(): string {
        return this._firstName;
    }

    public get lastName(): string | null {
        return this._lastName;
    }

    public get displayName(): string | null {
        return this._displayName;
    }

    public get phone(): Phone | null {
        return this._phone;
    }

    public get avatar(): Avatar | null {
        return this._avatar;
    }

    public get coverImage(): string | null {
        return this._coverImage;
    }

    public get bio(): string | null {
        return this._bio;
    }

    public get address(): string | null {
        return this._address;
    }

    public get website(): string | null {
        return this._website;
    }

    public get cityId(): number | null {
        return this._cityId;
    }

    public get provinceId(): number | null {
        return this._provinceId;
    }

    public get countryId(): number | null {
        return this._countryId;
    }

    public get dateOfBirth(): Date | null {
        return this._dateOfBirth;
    }

    public get createdAt(): Date {
        return this._createdAt;
    }

    public get updatedAt(): Date {
        return this._updatedAt;
    }

    public pullDomainEvents(): DomainEvent[] {
        return [];
    }

    public toPrimitives(): Record<string, any> {
        return {
            id: this._id,
            userId: this._userId,
            type: this._type,
            firstName: this._firstName,
            lastName: this._lastName,
            displayName: this._displayName,
            phone: this._phone
                ? this._phone.getValue()
                : null,
            avatar: this._avatar
                ? this._avatar.getValue()
                : null,
            coverImage: this._coverImage,
            bio: this._bio,
            address: this._address,
            website: this._website,
            cityId: this._cityId,
            provinceId: this._provinceId,
            countryId: this._countryId,
            dateOfBirth: this._dateOfBirth,
            createdAt: this._createdAt,
            updatedAt: this._updatedAt,
        };
    }

    public toPersistence(): Record<
        string,
        any
    > {
        return {
            id: this._id,
            userId: this._userId,
            type: this._type,
            firstName: this._firstName,
            lastName: this._lastName,
            displayName: this._displayName,
            phone: this._phone
                ? this._phone.getValue()
                : null,
            avatar: this._avatar
                ? this._avatar.getValue()
                : null,
            coverImage: this._coverImage,
            bio: this._bio,
            address: this._address,
            website: this._website,
            cityId: this._cityId,
            provinceId: this._provinceId,
            countryId: this._countryId,
            dateOfBirth: this._dateOfBirth,
            createdAt: this._createdAt,
            updatedAt: this._updatedAt,
        };
    }

    public static reconstitute(
        props: UserProfileProps,
    ): UserProfile {
        return new UserProfile(props);
    }
}
