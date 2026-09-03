import { Page } from '@playwright/test';
import { EMS_ROUTES } from './emsRoutes';
import { CodeCellListPage } from './CodeCellListPage';

export class ApiCallListPage extends CodeCellListPage {
  constructor(page: Page) {
    super(page, EMS_ROUTES.apiCalls, 'Api Call', EMS_ROUTES.createApiCall);
  }
}
