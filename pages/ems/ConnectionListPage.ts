import { Page } from '@playwright/test';
import { EMS_ROUTES } from './emsRoutes';
import { CodeCellListPage } from './CodeCellListPage';

export class ConnectionListPage extends CodeCellListPage {
  constructor(page: Page) {
    super(page, EMS_ROUTES.connections, 'Connection', EMS_ROUTES.createConnection);
  }
}
