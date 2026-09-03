import { Page } from '@playwright/test';
import { EMS_ROUTES } from './emsRoutes';
import { CodeCellListPage } from './CodeCellListPage';

export class MapperListPage extends CodeCellListPage {
  constructor(page: Page) {
    super(page, EMS_ROUTES.mappers, 'Mapper', EMS_ROUTES.createMapper);
  }
}
