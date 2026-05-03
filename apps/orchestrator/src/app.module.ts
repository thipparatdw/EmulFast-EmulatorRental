import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { ContainerModule } from './modules/container/container.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ContainerModule,
  ],
})
export class AppModule {}
