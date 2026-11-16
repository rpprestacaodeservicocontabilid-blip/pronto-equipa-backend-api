export interface UpdateProfileDTO {
  firstName?: string;
  lastName?: string | null;
  displayName?: string | null;
  phone?: string | null;
  bio?: string;
  dateOfBirth?: Date;
  gender?: string;
  address?: string;
  cityId?: number;
  provinceId?: number;
  countryId?: number;
  avatar?: string;
  coverImage?: string | null;
  website?: string | null;
  metadata?: Record<string, unknown>;
}
