/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { HttpStatus, Logger } from '@nestjs/common';

export interface SanitizedFlutterwaveError {
  statusCode: number;
  payload: Record<string, any>;
}

/**
 * Detects an HTML error page returned by an upstream proxy/CDN instead of JSON.
 * @param {unknown} payload - Upstream response body.
 * @returns {boolean} - True when the payload looks like an HTML document.
 */
export function isHtmlUpstreamPayload(payload: unknown): boolean {
  if (typeof payload !== 'string') return false;
  const value = payload.toLowerCase();
  return value.includes('<!doctype html') || value.includes('<html');
}

/**
 * Normalises any Flutterwave/axios failure into a safe HTTP error descriptor.
 *
 * Single source of truth for Flutterwave error mapping, shared by
 * FlutterwaveService and FlutterwaveApiService so both surfaces behave the same.
 *
 * @param {any} error - Error thrown by the HTTP layer.
 * @param {string} fallbackMessage - Message used when the upstream one is unusable.
 * @param {Logger} [logger] - Optional logger for upstream HTML failures.
 * @returns {SanitizedFlutterwaveError} - Status code + payload to expose.
 */
export function sanitizeFlutterwaveError(
  error: any,
  fallbackMessage: string,
  logger?: Logger,
): SanitizedFlutterwaveError {
  let statusCode = Number(error?.response?.status) || HttpStatus.BAD_GATEWAY;
  const upstreamPayload = error?.response?.data;

  // Never propagate 401 from Flutterwave API (invalid key) to avoid frontend auth clear
  if (statusCode === 401) {
    statusCode = HttpStatus.BAD_GATEWAY;
  }

  if (isHtmlUpstreamPayload(upstreamPayload)) {
    const message = 'Flutterwave temporary unavailable';
    logger?.error(`${message} (upstream HTML ${statusCode})`);
    return {
      statusCode: HttpStatus.BAD_GATEWAY,
      payload: {
        message,
        provider: 'flutterwave',
        code: 'FW_UPSTREAM_5XX',
      },
    };
  }

  if (upstreamPayload && typeof upstreamPayload === 'object') {
    return {
      statusCode,
      payload: upstreamPayload,
    };
  }

  const message = error?.message || fallbackMessage;
  return {
    statusCode: HttpStatus.BAD_GATEWAY,
    payload: {
      message: fallbackMessage,
      details: message,
    },
  };
}
