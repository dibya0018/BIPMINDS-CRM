/**
 * Elasticsearch Integration for Tag Search
 * 
 * This module provides Elasticsearch indexing and search functionality
 * for the tagging system. It enables fast, fuzzy tag search with autocomplete.
 * 
 * Setup Instructions:
 * 1. Install Elasticsearch: https://www.elastic.co/downloads/elasticsearch
 * 2. Install client: npm install @elastic/elasticsearch
 * 3. Set ELASTICSEARCH_URL in .env (default: http://localhost:9200)
 * 4. Run migration to create tags table
 * 5. Call indexAllTags() to populate Elasticsearch
 */

// Elasticsearch client - install with: npm install @elastic/elasticsearch
let Client;
try {
  const elasticsearch = require('@elastic/elasticsearch');
  Client = elasticsearch.Client;
} catch (error) {
  // Elasticsearch not installed, will use MySQL fallback
  Client = null;
}

const { getPool } = require('../config/database');
const logger = require('../config/logger');

// Elasticsearch client configuration
let esClient = null;

/**
 * Initialize Elasticsearch client
 */
function initElasticsearch() {
  // Only initialize if Elasticsearch URL is configured and client is available
  if (!process.env.ELASTICSEARCH_URL || !Client) {
    if (!Client) {
      logger.info('Elasticsearch client not installed. Using MySQL fallback for tag search.');
      logger.info('To enable Elasticsearch: npm install @elastic/elasticsearch');
    } else {
      logger.info('Elasticsearch URL not configured. Using MySQL fallback for tag search.');
    }
    return null;
  }

  try {
    const config = {
      node: process.env.ELASTICSEARCH_URL
    };

    // Add authentication if provided
    if (process.env.ELASTICSEARCH_USER && process.env.ELASTICSEARCH_PASSWORD) {
      config.auth = {
        username: process.env.ELASTICSEARCH_USER,
        password: process.env.ELASTICSEARCH_PASSWORD
      };
    }

    esClient = new Client(config);
    
    logger.info('Elasticsearch client initialized', { 
      node: process.env.ELASTICSEARCH_URL 
    });
    return esClient;
  } catch (error) {
    logger.error('Failed to initialize Elasticsearch', { error: error.message });
    return null;
  }
}

/**
 * Create Elasticsearch index for tags
 */
async function createTagsIndex() {
  if (!esClient) {
    logger.warn('Elasticsearch not available');
    return false;
  }
  
  try {
    const { body: indexExists } = await esClient.indices.exists({ index: 'tags' });
    
    if (!indexExists) {
      await esClient.indices.create({
        index: 'tags',
        body: {
          settings: {
            number_of_shards: 1,
            number_of_replicas: 1,
            analysis: {
              analyzer: {
                tag_analyzer: {
                  type: 'custom',
                  tokenizer: 'standard',
                  filter: ['lowercase', 'asciifolding', 'edge_ngram_filter']
                }
              },
              filter: {
                edge_ngram_filter: {
                  type: 'edge_ngram',
                  min_gram: 2,
                  max_gram: 20
                }
              }
            }
          },
          mappings: {
            properties: {
              tag_id: { type: 'integer' },
              tag_name: {
                type: 'text',
                analyzer: 'tag_analyzer',
                fields: {
                  keyword: { type: 'keyword' }
                }
              },
              tag_color: { type: 'keyword' },
              description: { type: 'text' },
              usage_count: { type: 'integer' },
              created_at: { type: 'date' },
              updated_at: { type: 'date' }
            }
          }
        }
      });
      
      logger.info('Tags index created in Elasticsearch');
      return true;
    }
    
    return true;
  } catch (error) {
    logger.error('Failed to create tags index', { error: error.message });
    return false;
  }
}

/**
 * Index a single tag in Elasticsearch
 */
async function indexTag(tag) {
  if (!esClient) {
    return false;
  }
  
  try {
    await esClient.index({
      index: 'tags',
      id: tag.tag_id.toString(),
      body: {
        tag_id: tag.tag_id,
        tag_name: tag.tag_name,
        tag_color: tag.tag_color,
        description: tag.description,
        usage_count: tag.usage_count,
        created_at: tag.created_at,
        updated_at: tag.updated_at
      }
    });
    
    logger.debug('Tag indexed in Elasticsearch', { tagId: tag.tag_id });
    return true;
  } catch (error) {
    logger.error('Failed to index tag', { 
      tagId: tag.tag_id, 
      error: error.message 
    });
    return false;
  }
}

/**
 * Index all tags from database to Elasticsearch
 */
async function indexAllTags() {
  if (!esClient) {
    logger.warn('Elasticsearch not available for bulk indexing');
    return false;
  }
  
  const pool = getPool();
  let connection;
  
  try {
    connection = await pool.getConnection();
    
    // Get all tags from database
    const [tags] = await connection.query('SELECT * FROM tags');
    
    if (tags.length === 0) {
      logger.info('No tags to index');
      return true;
    }
    
    // Bulk index all tags
    const body = tags.flatMap(tag => [
      { index: { _index: 'tags', _id: tag.tag_id.toString() } },
      {
        tag_id: tag.tag_id,
        tag_name: tag.tag_name,
        tag_color: tag.tag_color,
        description: tag.description,
        usage_count: tag.usage_count,
        created_at: tag.created_at,
        updated_at: tag.updated_at
      }
    ]);
    
    const { body: bulkResponse } = await esClient.bulk({ refresh: true, body });
    
    if (bulkResponse.errors) {
      logger.error('Bulk indexing had errors', { 
        errors: bulkResponse.items.filter(item => item.index.error) 
      });
      return false;
    }
    
    logger.info('All tags indexed in Elasticsearch', { count: tags.length });
    return true;
    
  } catch (error) {
    logger.error('Failed to index all tags', { error: error.message });
    return false;
  } finally {
    if (connection) connection.release();
  }
}

/**
 * Search tags in Elasticsearch
 */
async function searchTags(query, limit = 10) {
  if (!esClient) {
    // Fallback to MySQL search
    return searchTagsMySQL(query, limit);
  }
  
  try {
    const { body } = await esClient.search({
      index: 'tags',
      body: {
        query: {
          bool: {
            should: [
              {
                match: {
                  tag_name: {
                    query: query,
                    fuzziness: 'AUTO',
                    boost: 2
                  }
                }
              },
              {
                match_phrase_prefix: {
                  tag_name: {
                    query: query,
                    boost: 3
                  }
                }
              }
            ]
          }
        },
        sort: [
          { usage_count: { order: 'desc' } },
          { _score: { order: 'desc' } }
        ],
        size: limit
      }
    });
    
    const tags = body.hits.hits.map(hit => hit._source);
    return tags;
    
  } catch (error) {
    logger.error('Elasticsearch search failed, falling back to MySQL', { 
      error: error.message 
    });
    return searchTagsMySQL(query, limit);
  }
}

/**
 * Fallback MySQL search for tags
 */
async function searchTagsMySQL(query, limit = 10) {
  const pool = getPool();
  let connection;
  
  try {
    connection = await pool.getConnection();
    
    const [tags] = await connection.query(
      `SELECT * FROM tags 
       WHERE tag_name LIKE ? 
       ORDER BY usage_count DESC, tag_name ASC 
       LIMIT ?`,
      [`%${query}%`, limit]
    );
    
    return tags;
    
  } catch (error) {
    logger.error('MySQL tag search failed', { error: error.message });
    return [];
  } finally {
    if (connection) connection.release();
  }
}

/**
 * Delete tag from Elasticsearch
 */
async function deleteTagFromIndex(tagId) {
  if (!esClient) {
    return false;
  }
  
  try {
    await esClient.delete({
      index: 'tags',
      id: tagId.toString()
    });
    
    logger.debug('Tag deleted from Elasticsearch', { tagId });
    return true;
  } catch (error) {
    logger.error('Failed to delete tag from Elasticsearch', { 
      tagId, 
      error: error.message 
    });
    return false;
  }
}

/**
 * Update tag in Elasticsearch
 */
async function updateTagInIndex(tag) {
  if (!esClient) {
    return false;
  }
  
  try {
    await esClient.update({
      index: 'tags',
      id: tag.tag_id.toString(),
      body: {
        doc: {
          tag_name: tag.tag_name,
          tag_color: tag.tag_color,
          description: tag.description,
          usage_count: tag.usage_count,
          updated_at: tag.updated_at
        }
      }
    });
    
    logger.debug('Tag updated in Elasticsearch', { tagId: tag.tag_id });
    return true;
  } catch (error) {
    logger.error('Failed to update tag in Elasticsearch', { 
      tagId: tag.tag_id, 
      error: error.message 
    });
    return false;
  }
}

// Initialize on module load (only if configured)
if (process.env.ELASTICSEARCH_URL) {
  initElasticsearch();
}

module.exports = {
  initElasticsearch,
  createTagsIndex,
  indexTag,
  indexAllTags,
  searchTags,
  deleteTagFromIndex,
  updateTagInIndex
};
