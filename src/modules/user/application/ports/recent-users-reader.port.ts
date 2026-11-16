import { UserType } from '../../domain/enums/user-type.enum';
export interface RecentUserView {
  id: number;
  name: string;
  email: string;
  type: string;
  status: string;
  primaryRole: string | null;
  createdAt: Date;
}
export interface RecentUsersReaderPort {
  list(input: { limit: number; type?: UserType }): Promise<RecentUserView[]>;
}
