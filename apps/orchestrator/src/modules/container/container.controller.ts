import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';


import { ContainerService } from './container.service';

import type { CreateContainerDto } from './dto/create-container.dto';

@Controller()
export class ContainerController {
  constructor(private readonly containerService: ContainerService) {}

  @Get('health')
  health(): { status: string } {
    return { status: 'ok' };
  }

  @Post('containers')
  @HttpCode(HttpStatus.CREATED)
  createContainer(@Body() dto: CreateContainerDto) {
    return this.containerService.createContainer(dto);
  }

  @Get('containers/:id')
  getContainer(@Param('id') id: string) {
    return this.containerService.getContainer(id);
  }

  @Delete('containers/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteContainer(@Param('id') id: string): Promise<void> {
    await this.containerService.deleteContainer(id);
  }

  @Post('containers/:id/kill-scrcpy')
  @HttpCode(HttpStatus.NO_CONTENT)
  async killScrcpy(@Param('id') id: string): Promise<void> {
    await this.containerService.killScrcpy(id);
  }
}
