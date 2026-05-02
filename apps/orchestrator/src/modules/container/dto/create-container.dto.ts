export class CreateContainerDto {
  userId!: string;
  packageCode!: 'SFAST' | 'MFAST';
  expiresAt!: string; // ISO 8601
}
