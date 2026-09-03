import { Page } from '@playwright/test';
import { EMS_ROUTES } from './emsRoutes';
import { CodeCellListPage } from './CodeCellListPage';

export class ScriptListPage extends CodeCellListPage {
  constructor(page: Page) {
    super(page, EMS_ROUTES.scripts, 'Script', EMS_ROUTES.createScript);
  }
}
