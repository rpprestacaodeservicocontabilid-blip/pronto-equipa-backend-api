export interface CreateUserDTO {
  name: string;
  email: string;
  phone?: string;
  type?: string;
  profileType?: string;
  avatar?: string;
}
