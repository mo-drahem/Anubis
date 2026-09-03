import { test } from '@playwright/test';
import { BaseApiClient } from '../BaseApiClient';

// Track Service — follows the ingestion pipeline for a single event/job (create, look up
// by id, list, and pull its history/data). Doesn't fit the draft/live CRUD pattern used
// elsewhere, so it gets its own small client instead of reusing DraftLiveResourceApi.
export class TrackApi {
  constructor(private readonly client: BaseApiClient) {}

  create(body: unknown) {
    return test.step('Create track', () => this.client.post('/track/create', body));
  }

  createScheduledEvent(body: unknown) {
    return test.step('Create scheduled-event track', () => this.client.post('/track/create/scheduled-event', body));
  }

  updateScheduledEventTracking(body: unknown) {
    return test.step('Update scheduled-event tracking', () => this.client.put('/track/update/scheduled-event', body));
  }

  getById(jobId: string) {
    return test.step(`Get track by id (${jobId})`, () => this.client.get(`/track/${jobId}`));
  }

  list(params?: Record<string, string | number | boolean>) {
    return test.step('List track', () => this.client.get('/track', params));
  }

  getHistory(jobId: string) {
    return test.step(`Get track history (${jobId})`, () => this.client.get(`/track-history/${jobId}`));
  }

  getHistoryFiltered(body: unknown) {
    return test.step('Get track history (filtered)', () => this.client.post('/track-history', body));
  }

  getData(jobId: string) {
    return test.step(`Get track data (${jobId})`, () => this.client.get(`/track-data/${jobId}`));
  }

  getDataFiltered(body: unknown) {
    return test.step('Get track data (filtered)', () => this.client.post('/track-data', body));
  }
}
