import type { User } from '../types';

export const ROLE_LABEL: Record<User['role'], string> = {
  admin: 'Quản trị',
  editor: 'Biên tập',
  viewer: 'Chỉ xem',
};
