-- ============================================================================
-- Migration: Add UTM Tracking to Leads Table
-- Description: Adds UTM parameters and click IDs for marketing attribution
-- Date: 2026-02-02
-- ============================================================================

-- Add UTM tracking columns to leads table (all in one ALTER statement)
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS utm_source VARCHAR(255) NULL COMMENT 'UTM source parameter (e.g., google, facebook)',
ADD COLUMN IF NOT EXISTS utm_medium VARCHAR(255) NULL COMMENT 'UTM medium parameter (e.g., cpc, email, social)',
ADD COLUMN IF NOT EXISTS utm_campaign VARCHAR(255) NULL COMMENT 'UTM campaign parameter',
ADD COLUMN IF NOT EXISTS utm_term VARCHAR(255) NULL COMMENT 'UTM term parameter (keywords)',
ADD COLUMN IF NOT EXISTS utm_content VARCHAR(255) NULL COMMENT 'UTM content parameter (ad variation)',
ADD COLUMN IF NOT EXISTS gclid VARCHAR(255) NULL COMMENT 'Google Click ID for Google Ads tracking',
ADD COLUMN IF NOT EXISTS fbclid VARCHAR(255) NULL COMMENT 'Facebook Click ID for Facebook Ads tracking';

-- Add indexes for better query performance on UTM fields
CREATE INDEX IF NOT EXISTS idx_utm_source ON leads(utm_source);
CREATE INDEX IF NOT EXISTS idx_utm_medium ON leads(utm_medium);
CREATE INDEX IF NOT EXISTS idx_utm_campaign ON leads(utm_campaign);
CREATE INDEX IF NOT EXISTS idx_gclid ON leads(gclid);
CREATE INDEX IF NOT EXISTS idx_fbclid ON leads(fbclid);

-- Add comment to table
ALTER TABLE leads COMMENT = 'Leads table with UTM tracking for marketing attribution';
