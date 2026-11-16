import { RecentUsersReaderPort } from '../ports/recent-users-reader.port';
import { UserType } from '../../domain/enums/user-type.enum';
export class ListRecentUsersUseCase {
  constructor(private readonly reader: RecentUsersReaderPort) {}
  execute(input: { limit: number; type?: UserType }) {
    if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100)
      throw new Error('Invalid recent users limit.');
    return this.reader.list(input);
  }
}
