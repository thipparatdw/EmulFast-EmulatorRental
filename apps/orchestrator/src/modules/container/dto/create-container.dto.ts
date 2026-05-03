export class CreateContainerDto {
  userId!: string;
  packageCode!: 'SFAST' | 'MFAST';
  androidVersion?: '10' | '12';
  expiresAt!: string; // ISO 8601
}
