# Escrow Services Operational Runbooks

This document provides operational runbooks for daily operations, troubleshooting, recovery procedures, and emergency response for the Escrow Services.

## Table of Contents

1. [Daily Operations](#daily-operations)
2. [Common Issues](#common-issues)
3. [Troubleshooting Guides](#troubleshooting-guides)
4. [Recovery Procedures](#recovery-procedures)
5. [Emergency Procedures](#emergency-procedures)

## Daily Operations

### Health Check Procedures

#### 1. Service Health Checks

**API Gateway Health:**
```bash
# Check health endpoint
curl https://api.bloxtr8.com/health

# Expected response:
# {"status":"ok","timestamp":"2025-01-02T12:00:00.000Z","checks":{"database":"ok","kafka":"ok"}}

# Check response time
time curl -s https://api.bloxtr8.com/health
```

**Escrow Service Health:**
```bash
# If health endpoint exposed
curl http://escrow-service:3001/health

# Check via logs
docker logs bloxtr8-escrow-service --tail 50 | grep -i "health\|error\|started"
```

#### 2. Database Health

```bash
# Check database connectivity
psql $DATABASE_URL -c "SELECT 1;"

# Check connection pool usage
psql $DATABASE_URL -c "
SELECT 
  count(*) as total_connections,
  count(*) FILTER (WHERE state = 'active') as active_connections,
  count(*) FILTER (WHERE state = 'idle') as idle_connections
FROM pg_stat_activity
WHERE datname = 'bloxtr8';
"

# Check for long-running queries
psql $DATABASE_URL -c "
SELECT 
  pid,
  now() - query_start as duration,
  query
FROM pg_stat_activity
WHERE state = 'active'
  AND query NOT LIKE '%pg_stat_activity%'
ORDER BY duration DESC
LIMIT 10;
"
```

#### 3. Kafka Health

```bash
# Check broker connectivity
kafka-broker-api-versions.sh --bootstrap-server $KAFKA_BROKERS

# Check consumer lag
kafka-consumer-groups.sh \
  --bootstrap-server $KAFKA_BROKERS \
  --group escrow-service-group \
  --describe

# Check topic health
kafka-topics.sh \
  --bootstrap-server $KAFKA_BROKERS \
  --describe \
  --topic escrow-commands \
  --topic escrow.events.v1
```

#### 4. Outbox Publisher Health

```bash
# Check unpublished events count
psql $DATABASE_URL -c "
SELECT COUNT(*) as unpublished_events
FROM outbox
WHERE publishedAt IS NULL;
"

# Check events older than 5 minutes
psql $DATABASE_URL -c "
SELECT COUNT(*) as stale_events
FROM outbox
WHERE publishedAt IS NULL
  AND createdAt < NOW() - INTERVAL '5 minutes';
"
```

### Monitoring Dashboards

#### Key Metrics to Monitor

1. **API Gateway Metrics:**
   - Request rate (requests/second)
   - Error rate (errors/second)
   - Response time (p50, p95, p99)
   - Active connections

2. **Escrow Service Metrics:**
   - Command processing rate
   - Command processing latency
   - Failed commands count
   - Kafka consumer lag

3. **Database Metrics:**
   - Connection pool usage
   - Query latency
   - Transaction rate
   - Lock wait time

4. **Kafka Metrics:**
   - Consumer lag
   - Producer throughput
   - Topic partition sizes
   - Replication lag

5. **Business Metrics:**
   - Escrows created per hour
   - Escrows transitioning states
   - Escrows expiring
   - Escrows in dispute

#### Dashboard Queries

**Prometheus/Grafana Queries:**
```
# Request rate
rate(http_requests_total[5m])

# Error rate
rate(http_requests_total{status=~"5.."}[5m])

# Kafka consumer lag
kafka_consumer_lag_sum{group="escrow-service-group"}

# Database connections
pg_stat_database_numbackends{datname="bloxtr8"}
```

### Log Analysis

#### Log Locations

**Docker:**
```bash
docker logs bloxtr8-api-gateway --tail 100 -f
docker logs bloxtr8-escrow-service --tail 100 -f
```

**Kubernetes:**
```bash
kubectl logs -f deployment/bloxtr8-api-gateway
kubectl logs -f deployment/bloxtr8-escrow-service
```

**Railway/Render:**
```bash
railway logs --service api-gateway
render logs bloxtr8-api-gateway
```

#### Key Log Patterns to Monitor

**Errors:**
```bash
# Find errors in logs
grep -i "error\|exception\|failed" /var/log/app.log | tail -50

# Find specific error types
grep "InvalidStateTransitionError" /var/log/app.log
grep "EscrowNotFoundError" /var/log/app.log
grep "OptimisticLockError" /var/log/app.log
```

**Performance Issues:**
```bash
# Find slow queries
grep "slow query" /var/log/app.log | tail -20

# Find high latency requests
grep "latency.*ms" /var/log/app.log | awk '$NF > 1000'
```

**State Transitions:**
```bash
# Monitor state transitions
grep "State transition" /var/log/app.log | tail -50

# Find failed transitions
grep "Invalid transition" /var/log/app.log
```

### Performance Metrics Review

#### Daily Review Checklist

- [ ] API Gateway response times < 200ms (p95)
- [ ] Error rate < 0.1%
- [ ] Kafka consumer lag < 1000 messages
- [ ] Database connection pool usage < 80%
- [ ] Outbox unpublished events < 100
- [ ] No stuck escrows (AWAIT_FUNDS > 7 days)
- [ ] No escrows stuck in DELIVERED > 7 days
- [ ] Timeout processor running successfully

#### Weekly Review

- [ ] Review slow query log
- [ ] Analyze error trends
- [ ] Review consumer lag trends
- [ ] Check for unusual state transition patterns
- [ ] Review dispute resolution times
- [ ] Analyze payment confirmation delays

## Common Issues

### Service Unavailable

**Symptoms:**
- Health check endpoint returns 503
- Service not responding to requests
- High error rate in logs

**Diagnosis:**
```bash
# Check if service is running
docker ps | grep bloxtr8-api-gateway
kubectl get pods | grep bloxtr8-api-gateway

# Check service logs
docker logs bloxtr8-api-gateway --tail 100
kubectl logs deployment/bloxtr8-api-gateway --tail 100

# Check resource usage
docker stats bloxtr8-api-gateway
kubectl top pod bloxtr8-api-gateway
```

**Resolution:**
1. Check logs for errors
2. Verify environment variables are set correctly
3. Check database connectivity
4. Check Kafka connectivity
5. Restart service if needed:
   ```bash
   docker restart bloxtr8-api-gateway
   kubectl rollout restart deployment/bloxtr8-api-gateway
   ```

### Database Connection Failures

**Symptoms:**
- "Connection refused" errors
- "Too many connections" errors
- Connection pool exhausted

**Diagnosis:**
```bash
# Check database connectivity
psql $DATABASE_URL -c "SELECT 1;"

# Check connection pool usage
psql $DATABASE_URL -c "
SELECT 
  count(*) as total,
  count(*) FILTER (WHERE state = 'active') as active,
  count(*) FILTER (WHERE state = 'idle') as idle
FROM pg_stat_activity
WHERE datname = 'bloxtr8';
"

# Check max connections
psql $DATABASE_URL -c "SHOW max_connections;"
```

**Resolution:**
1. **Connection Pool Exhausted:**
   - Reduce `DATABASE_POOL_SIZE` if too high
   - Kill idle connections:
     ```sql
     SELECT pg_terminate_backend(pid)
     FROM pg_stat_activity
     WHERE datname = 'bloxtr8'
       AND state = 'idle'
       AND state_change < NOW() - INTERVAL '5 minutes';
     ```

2. **Database Unreachable:**
   - Check database server status
   - Verify network connectivity
   - Check firewall rules
   - Verify credentials

3. **Too Many Connections:**
   - Increase `max_connections` in PostgreSQL
   - Reduce number of application instances
   - Implement connection pooling (PgBouncer)

### Kafka Consumer Lag

**Symptoms:**
- Consumer lag increasing
- Commands not being processed
- Delayed escrow state transitions

**Diagnosis:**
```bash
# Check consumer lag
kafka-consumer-groups.sh \
  --bootstrap-server $KAFKA_BROKERS \
  --group escrow-service-group \
  --describe

# Check consumer status
kafka-consumer-groups.sh \
  --bootstrap-server $KAFKA_BROKERS \
  --group escrow-service-group \
  --describe \
  --members
```

**Resolution:**
1. **High Consumer Lag:**
   - Scale up consumers (increase replicas)
   - Check consumer processing speed
   - Investigate slow command handlers
   - Check for stuck consumers

2. **Consumer Not Processing:**
   - Check if consumer is running
   - Check consumer logs for errors
   - Verify consumer group configuration
   - Restart consumer if needed

3. **Rebalance Issues:**
   - Check for consumer crashes
   - Verify network connectivity
   - Check Kafka broker health

### Outbox Publisher Stuck

**Symptoms:**
- Outbox events not being published
- `publishedAt` remains NULL for old events
- Kafka events not appearing

**Diagnosis:**
```bash
# Check unpublished events
psql $DATABASE_URL -c "
SELECT COUNT(*) as unpublished,
       MIN(createdAt) as oldest_unpublished
FROM outbox
WHERE publishedAt IS NULL;
"

# Check outbox publisher logs
docker logs bloxtr8-outbox-publisher --tail 100 | grep -i "error\|failed"
```

**Resolution:**
1. **Publisher Not Running:**
   - Restart outbox publisher service
   - Check service health

2. **Kafka Connection Issues:**
   - Verify Kafka broker connectivity
   - Check Kafka credentials
   - Check network connectivity

3. **Failed Events:**
   - Check logs for specific errors
   - Verify event payload format
   - Check Kafka topic configuration

### State Transition Failures

**Symptoms:**
- Escrows stuck in intermediate states
- Invalid state transition errors
- Optimistic lock failures

**Diagnosis:**
```sql
-- Find escrows stuck in states
SELECT id, status, version, updatedAt, expiresAt, autoRefundAt
FROM escrows
WHERE status NOT IN ('RELEASED', 'REFUNDED', 'CANCELLED')
  AND updatedAt < NOW() - INTERVAL '1 hour';

-- Check for optimistic lock failures
SELECT COUNT(*) as lock_failures
FROM audit_logs
WHERE action LIKE '%OPTIMISTIC_LOCK%'
  AND createdAt > NOW() - INTERVAL '1 hour';
```

**Resolution:**
1. **Optimistic Lock Failures:**
   - Normal in high-concurrency scenarios
   - Retry automatically handled
   - If persistent, investigate concurrent access patterns

2. **Invalid State Transitions:**
   - Check business logic validation
   - Verify authorization requirements
   - Review audit logs for details

3. **Stuck Escrows:**
   - Manual intervention may be required
   - See [State Machine Recovery](#state-machine-recovery) section

### Webhook Processing Failures

**Symptoms:**
- Payment confirmations not processing
- Webhook events not updating escrow state
- Stripe/Custodian webhook errors

**Diagnosis:**
```bash
# Check webhook logs
grep "webhook" /var/log/app.log | tail -50

# Check for failed webhook processing
psql $DATABASE_URL -c "
SELECT 
  escrowId,
  COUNT(*) as webhook_attempts,
  MAX(createdAt) as last_attempt
FROM audit_logs
WHERE action LIKE '%webhook%'
  AND details->>'status' = 'failed'
GROUP BY escrowId
ORDER BY last_attempt DESC
LIMIT 10;
"
```

**Resolution:**
1. **Webhook Signature Verification Failed:**
   - Verify webhook secret is correct
   - Check webhook payload format
   - Verify webhook source IP

2. **Idempotency Issues:**
   - Check idempotency key handling
   - Verify webhook replay protection
   - Check for duplicate processing

3. **State Validation Failures:**
   - Escrow may be in wrong state
   - Check escrow status before processing
   - Verify webhook event type matches escrow state

## Troubleshooting Guides

### Escrow Stuck in State

#### Problem: Escrow in AWAIT_FUNDS > 7 days

**Investigation:**
```sql
-- Find stuck escrows
SELECT 
  e.id,
  e.status,
  e.createdAt,
  e.expiresAt,
  e.amount,
  e.rail,
  o.buyerId,
  o.sellerId
FROM escrows e
JOIN offers o ON e.offerId = o.id
WHERE e.status = 'AWAIT_FUNDS'
  AND e.expiresAt < NOW()
ORDER BY e.expiresAt ASC;
```

**Resolution:**
1. Check if timeout processor is running
2. Verify expiration logic is working
3. Manually trigger expiration:
   ```sql
   -- Manually expire escrow (with caution)
   UPDATE escrows
   SET status = 'CANCELLED',
       metadata = jsonb_set(
         COALESCE(metadata, '{}'::jsonb),
         '{manualExpiration}',
         to_jsonb(NOW()::text)
       )
   WHERE id = 'escrow-id'
     AND status = 'AWAIT_FUNDS'
     AND expiresAt < NOW();
   ```

#### Problem: Escrow in DELIVERED > 7 days

**Investigation:**
```sql
-- Find escrows waiting for buyer confirmation
SELECT 
  e.id,
  e.status,
  e.autoRefundAt,
  d.id as delivery_id,
  d.deliveredAt,
  o.buyerId
FROM escrows e
JOIN deliveries d ON e.id = d.escrowId
JOIN offers o ON e.offerId = o.id
WHERE e.status = 'DELIVERED'
  AND e.autoRefundAt < NOW()
ORDER BY e.autoRefundAt ASC;
```

**Resolution:**
1. Check if auto-refund processor is running
2. Verify auto-refund logic is working
3. Manually trigger auto-refund:
   ```sql
   -- Manually trigger auto-refund (with caution)
   -- This should be done via command, not direct SQL
   -- See recovery procedures section
   ```

### Payment Confirmation Failures

#### Problem: Payment not confirming after webhook

**Investigation:**
```sql
-- Check payment confirmation attempts
SELECT 
  e.id,
  e.status,
  se.paymentIntentId,
  se.lastWebhookAt,
  COUNT(al.id) as webhook_attempts
FROM escrows e
LEFT JOIN stripe_escrows se ON e.id = se.escrowId
LEFT JOIN audit_logs al ON e.id = al.escrowId AND al.action LIKE '%payment%'
WHERE e.status = 'AWAIT_FUNDS'
  AND e.createdAt > NOW() - INTERVAL '24 hours'
GROUP BY e.id, e.status, se.paymentIntentId, se.lastWebhookAt;
```

**Resolution:**
1. **Webhook Not Received:**
   - Verify Stripe webhook configuration
   - Check Stripe dashboard for webhook events
   - Verify webhook endpoint is accessible

2. **Webhook Received but Failed:**
   - Check webhook processing logs
   - Verify idempotency handling
   - Check state validation

3. **Manual Payment Confirmation:**
   ```bash
   # Create payment confirmation command
   curl -X POST https://api.bloxtr8.com/api/escrow/{escrowId}/confirm-payment \
     -H "Authorization: Bearer $ADMIN_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "transactionId": "pi_xxx",
       "evidence": "Manual confirmation"
     }'
   ```

### Delivery Confirmation Issues

#### Problem: Delivery not marking as complete

**Investigation:**
```sql
-- Check delivery status
SELECT 
  e.id as escrow_id,
  e.status as escrow_status,
  d.id as delivery_id,
  d.status as delivery_status,
  d.deliveredAt,
  d.deliveredBy,
  o.sellerId
FROM escrows e
JOIN deliveries d ON e.id = d.escrowId
JOIN offers o ON e.offerId = o.id
WHERE e.status = 'FUNDS_HELD'
  AND d.status = 'PENDING'
ORDER BY d.createdAt DESC;
```

**Resolution:**
1. **Authorization Failure:**
   - Verify seller is marking delivery
   - Check authorization middleware
   - Verify user permissions

2. **State Validation Failure:**
   - Escrow must be in FUNDS_HELD
   - Check state transition guards
   - Review audit logs

3. **Manual Delivery Marking:**
   ```bash
   # Create delivery command
   curl -X POST https://api.bloxtr8.com/api/escrow/{escrowId}/mark-delivered \
     -H "Authorization: Bearer $SELLER_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "title": "Delivery Title",
       "description": "Delivery description",
       "evidence": {}
     }'
   ```

### Dispute Resolution Problems

#### Problem: Dispute not resolving

**Investigation:**
```sql
-- Check dispute status
SELECT 
  d.id as dispute_id,
  d.status as dispute_status,
  e.id as escrow_id,
  e.status as escrow_status,
  d.createdAt,
  d.resolvedAt
FROM disputes d
JOIN escrows e ON d.escrowId = e.id
WHERE d.status IN ('OPEN', 'IN_REVIEW')
  AND d.createdAt < NOW() - INTERVAL '7 days';
```

**Resolution:**
1. **Admin Resolution Required:**
   - Verify admin has access
   - Check authorization middleware
   - Verify dispute resolution endpoint

2. **State Validation:**
   - Escrow must be in DISPUTED state
   - Check state transition guards
   - Verify resolution command format

3. **Manual Dispute Resolution:**
   ```bash
   # Resolve dispute
   curl -X POST https://api.bloxtr8.com/api/escrow/{escrowId}/dispute/{disputeId}/resolve \
     -H "Authorization: Bearer $ADMIN_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "resolution": "RELEASE",
       "reason": "Dispute resolved in favor of seller"
     }'
   ```

### Timeout Processing Failures

#### Problem: Timeout processor not running

**Investigation:**
```bash
# Check timeout processor logs
docker logs bloxtr8-escrow-service | grep -i "timeout\|expired\|auto-refund"

# Check cron job status
# (if using cron-based timeout processor)
```

**Resolution:**
1. **Processor Not Running:**
   - Restart escrow service
   - Verify timeout processor is enabled
   - Check configuration

2. **Database Query Issues:**
   - Verify indexes exist on `expiresAt` and `autoRefundAt`
   - Check query performance
   - Optimize queries if needed

3. **Manual Timeout Processing:**
   ```bash
   # Trigger timeout processing manually
   curl -X POST https://api.bloxtr8.com/api/admin/process-timeouts \
     -H "Authorization: Bearer $ADMIN_TOKEN"
   ```

## Recovery Procedures

### Database Recovery

#### Scenario: Database Corruption or Data Loss

**Pre-Recovery Steps:**
1. Stop all services
2. Take current database backup
3. Document current state

**Recovery Procedure:**
```bash
# Restore from backup
pg_restore -h $DB_HOST -U $DB_USER -d bloxtr8 backup.sql

# Verify data integrity
psql $DATABASE_URL -c "
SELECT 
  COUNT(*) as total_escrows,
  COUNT(*) FILTER (WHERE status = 'AWAIT_FUNDS') as awaiting_funds,
  COUNT(*) FILTER (WHERE status = 'FUNDS_HELD') as funds_held,
  COUNT(*) FILTER (WHERE status = 'RELEASED') as released
FROM escrows;
"

# Check referential integrity
psql $DATABASE_URL -c "
SELECT 
  'Missing offers' as issue,
  COUNT(*) as count
FROM escrows e
LEFT JOIN offers o ON e.offerId = o.id
WHERE o.id IS NULL
UNION ALL
SELECT 
  'Missing contracts' as issue,
  COUNT(*) as count
FROM escrows e
LEFT JOIN contracts c ON e.contractId = c.id
WHERE c.id IS NULL;
"
```

**Post-Recovery:**
1. Verify all services can connect
2. Run smoke tests
3. Monitor for errors
4. Update disaster recovery documentation

### Kafka Offset Reset

#### Scenario: Need to Reprocess Commands

**Warning**: Only reset offsets if you understand the implications. Idempotency should prevent duplicate processing.

**Procedure:**
```bash
# Check current offsets
kafka-consumer-groups.sh \
  --bootstrap-server $KAFKA_BROKERS \
  --group escrow-service-group \
  --describe

# Stop consumers
# (Stop escrow service instances)

# Reset offsets to specific timestamp
kafka-consumer-groups.sh \
  --bootstrap-server $KAFKA_BROKERS \
  --group escrow-service-group \
  --topic escrow-commands \
  --reset-offsets \
  --to-datetime 2025-01-02T10:00:00.000Z \
  --execute

# Or reset to earliest
kafka-consumer-groups.sh \
  --bootstrap-server $KAFKA_BROKERS \
  --group escrow-service-group \
  --topic escrow-commands \
  --reset-offsets \
  --to-earliest \
  --execute

# Verify offsets
kafka-consumer-groups.sh \
  --bootstrap-server $KAFKA_BROKERS \
  --group escrow-service-group \
  --describe

# Restart consumers
# (Start escrow service instances)
```

**Post-Reset:**
1. Monitor consumer lag
2. Check for duplicate processing (should be prevented by idempotency)
3. Verify commands are processing correctly
4. Monitor error rates

### Outbox Replay

#### Scenario: Events Not Published to Kafka

**Investigation:**
```sql
-- Find unpublished events
SELECT 
  id,
  aggregateId,
  eventType,
  createdAt,
  NOW() - createdAt as age
FROM outbox
WHERE publishedAt IS NULL
ORDER BY createdAt ASC
LIMIT 100;
```

**Recovery Procedure:**
```sql
-- Option 1: Reset publishedAt for failed events
UPDATE outbox
SET publishedAt = NULL
WHERE id IN (
  SELECT id
  FROM outbox
  WHERE publishedAt IS NOT NULL
    AND createdAt < NOW() - INTERVAL '1 hour'
    AND aggregateId IN (
      -- Find escrows that should have events but don't
      SELECT e.id
      FROM escrows e
      LEFT JOIN escrow_events ee ON e.id = ee.escrowId
      WHERE ee.id IS NULL
    )
  LIMIT 1000
);

-- Option 2: Reset all unpublished events (use with caution)
-- UPDATE outbox
-- SET publishedAt = NULL
-- WHERE publishedAt IS NULL
--   AND createdAt < NOW() - INTERVAL '5 minutes';
```

**Post-Replay:**
1. Restart outbox publisher
2. Monitor event publishing
3. Verify events appear in Kafka
4. Check consumer processing

### State Machine Recovery

#### Scenario: Escrows in Invalid States

**Investigation:**
```sql
-- Find escrows with invalid states
SELECT 
  id,
  status,
  version,
  createdAt,
  updatedAt,
  expiresAt,
  autoRefundAt
FROM escrows
WHERE status NOT IN ('RELEASED', 'REFUNDED', 'CANCELLED')
  AND (
    -- Expired but not cancelled
    (status = 'AWAIT_FUNDS' AND expiresAt < NOW())
    OR
    -- Auto-refund deadline passed but not refunded
    (status = 'DELIVERED' AND autoRefundAt < NOW())
  );
```

**Recovery Procedure:**

**1. Expired Escrows (AWAIT_FUNDS):**
```sql
-- Manually expire escrows
UPDATE escrows
SET 
  status = 'CANCELLED',
  version = version + 1,
  updatedAt = NOW(),
  metadata = jsonb_set(
    COALESCE(metadata, '{}'::jsonb),
    '{manualRecovery}',
    jsonb_build_object(
      'reason', 'Expired escrow recovery',
      'recoveredAt', NOW()::text,
      'previousStatus', status
    )
  )
WHERE status = 'AWAIT_FUNDS'
  AND expiresAt < NOW()
  AND expiresAt < NOW() - INTERVAL '1 day'; -- Only old expired escrows

-- Create audit log
INSERT INTO audit_logs (action, details, escrowId, createdAt)
SELECT 
  'escrow.cancelled',
  jsonb_build_object(
    'reason', 'Manual recovery: expired escrow',
    'recoveredAt', NOW()::text
  ),
  id,
  NOW()
FROM escrows
WHERE status = 'CANCELLED'
  AND metadata->>'manualRecovery' IS NOT NULL;
```

**2. Auto-Refund Escrows (DELIVERED):**
```sql
-- Manually trigger auto-refund (create command, don't update directly)
-- This should be done via command handler to maintain consistency
-- See manual command creation below
```

**3. Manual State Transition (Use with Extreme Caution):**
```sql
-- Only use if absolutely necessary
-- This bypasses business logic validation

-- Example: Manually release funds (admin override)
UPDATE escrows
SET 
  status = 'RELEASED',
  version = version + 1,
  updatedAt = NOW(),
  metadata = jsonb_set(
    COALESCE(metadata, '{}'::jsonb),
    '{manualRecovery}',
    jsonb_build_object(
      'reason', 'Admin override: manual release',
      'recoveredAt', NOW()::text,
      'adminUserId', 'admin-user-id'
    )
  )
WHERE id = 'escrow-id'
  AND status IN ('DELIVERED', 'DISPUTED');

-- Create audit log
INSERT INTO audit_logs (action, details, escrowId, userId, createdAt)
VALUES (
  'escrow.released',
  jsonb_build_object(
    'reason', 'Manual recovery: admin override',
    'recoveredAt', NOW()::text
  ),
  'escrow-id',
  'admin-user-id',
  NOW()
);
```

**Post-Recovery:**
1. Verify escrow states are correct
2. Check audit logs for recovery actions
3. Monitor for similar issues
4. Document recovery actions

### Webhook Replay

#### Scenario: Webhook Events Missed or Failed

**Procedure:**
1. **Stripe Webhook Replay:**
   - Use Stripe Dashboard to replay webhook events
   - Or use Stripe CLI:
     ```bash
     stripe events resend evt_xxx
     ```

2. **Custodian Webhook Replay:**
   - Contact custodian support for webhook replay
   - Or manually trigger payment confirmation

3. **Manual Payment Confirmation:**
   ```bash
   curl -X POST https://api.bloxtr8.com/api/escrow/{escrowId}/confirm-payment \
     -H "Authorization: Bearer $ADMIN_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "transactionId": "pi_xxx",
       "evidence": "Manual webhook replay"
     }'
   ```

### Partial Refund Recovery

#### Scenario: Partial Refund Failed or Incomplete

**Investigation:**
```sql
-- Find partial refunds
SELECT 
  e.id,
  e.status,
  e.amount,
  e.metadata->>'refundAmount' as refund_amount,
  e.metadata->>'refundType' as refund_type,
  al.createdAt as refund_initiated_at
FROM escrows e
JOIN audit_logs al ON e.id = al.escrowId
WHERE e.status = 'REFUNDED'
  AND e.metadata->>'refundType' = 'PARTIAL'
  AND al.action = 'escrow.refunded'
ORDER BY al.createdAt DESC;
```

**Recovery Procedure:**
1. Verify refund amount in payment provider
2. If refund incomplete, create additional refund command
3. Update escrow metadata with actual refunded amount
4. Create audit log entry

**Manual Refund Command:**
```bash
curl -X POST https://api.bloxtr8.com/api/escrow/{escrowId}/refund \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "refundAmount": 5000,
    "reason": "Complete partial refund"
  }'
```

## Emergency Procedures

### Service Degradation

#### Scenario: Service Performance Degraded

**Immediate Actions:**
1. **Scale Up Services:**
   ```bash
   # Docker
   docker-compose -f docker-compose.prod.yml up -d --scale api-gateway=3
   
   # Kubernetes
   kubectl scale deployment bloxtr8-api-gateway --replicas=5
   ```

2. **Enable Rate Limiting:**
   - Reduce rate limits temporarily
   - Block problematic IPs if needed

3. **Check Resource Usage:**
   ```bash
   # CPU/Memory
   docker stats
   kubectl top pods
   
   # Database
   psql $DATABASE_URL -c "SELECT * FROM pg_stat_activity WHERE state = 'active';"
   ```

4. **Check for DDoS:**
   - Review access logs
   - Block suspicious IPs
   - Enable DDoS protection

**Escalation:**
- If degradation persists > 5 minutes, escalate to on-call engineer
- If error rate > 1%, consider service degradation mode
- If database connections exhausted, consider read-only mode

### Data Corruption

#### Scenario: Data Integrity Issues Detected

**Immediate Actions:**
1. **Stop All Services:**
   ```bash
   docker-compose -f docker-compose.prod.yml stop
   kubectl scale deployment --all --replicas=0
   ```

2. **Assess Damage:**
   ```sql
   -- Check referential integrity
   SELECT 
     'Missing offers' as issue,
     COUNT(*) as count
   FROM escrows e
   LEFT JOIN offers o ON e.offerId = o.id
   WHERE o.id IS NULL
   UNION ALL
   SELECT 
     'Invalid state transitions' as issue,
     COUNT(*) as count
   FROM escrows e
   JOIN escrow_events ee ON e.id = ee.escrowId
   WHERE ee.eventType LIKE '%TRANSITIONED'
     AND NOT EXISTS (
       SELECT 1 FROM escrow_events ee2
       WHERE ee2.escrowId = e.id
         AND ee2.createdAt < ee.createdAt
         AND ee2.eventType LIKE '%TRANSITIONED'
     );
   ```

3. **Restore from Backup:**
   - Use most recent known-good backup
   - See [Database Recovery](#database-recovery) section

4. **Verify Data:**
   - Run integrity checks
   - Compare with backups
   - Check audit logs

**Post-Recovery:**
1. Document corruption cause
2. Implement prevention measures
3. Update monitoring to detect similar issues
4. Review data validation logic

### Security Incidents

#### Scenario: Unauthorized Access or Data Breach

**Immediate Actions:**
1. **Isolate Affected Systems:**
   ```bash
   # Block suspicious IPs
   iptables -A INPUT -s <suspicious-ip> -j DROP
   
   # Revoke compromised credentials
   # Update all API keys and secrets
   ```

2. **Preserve Evidence:**
   - Save logs
   - Take database snapshots
   - Document all actions

3. **Assess Impact:**
   - Identify compromised data
   - Check access logs
   - Review audit logs

4. **Notify Stakeholders:**
   - Security team
   - Management
   - Legal/compliance (if required)

**Recovery Steps:**
1. Rotate all credentials
2. Review and update security policies
3. Conduct security audit
4. Implement additional monitoring

### Payment Processing Failures

#### Scenario: Payments Not Processing or Funds Stuck

**Immediate Actions:**
1. **Stop Payment Processing:**
   - Disable payment endpoints temporarily
   - Put system in maintenance mode

2. **Assess Impact:**
   ```sql
   -- Find escrows with payment issues
   SELECT 
     e.id,
     e.status,
     e.amount,
     e.rail,
     se.paymentIntentId,
     se.lastWebhookAt,
     COUNT(al.id) as failed_attempts
   FROM escrows e
   LEFT JOIN stripe_escrows se ON e.id = se.escrowId
   LEFT JOIN audit_logs al ON e.id = al.escrowId 
     AND al.action LIKE '%payment%failed%'
   WHERE e.status = 'AWAIT_FUNDS'
     AND e.createdAt > NOW() - INTERVAL '24 hours'
   GROUP BY e.id, e.status, e.amount, e.rail, se.paymentIntentId, se.lastWebhookAt;
   ```

3. **Check Payment Provider Status:**
   - Verify Stripe/Custodian service status
   - Check API connectivity
   - Review payment provider logs

4. **Manual Intervention:**
   - Process payments manually if possible
   - Escalate to payment provider support
   - Document all manual actions

**Recovery Steps:**
1. Fix root cause
2. Replay failed payments
3. Verify all payments processed
4. Update monitoring for payment failures

### Complete Service Outage

#### Scenario: All Services Down

**Immediate Actions:**
1. **Check Infrastructure:**
   - Verify cloud provider status
   - Check database availability
   - Check Kafka availability
   - Verify network connectivity

2. **Start Services in Order:**
   ```bash
   # 1. Database (if self-hosted)
   docker start postgres
   
   # 2. Kafka (if self-hosted)
   docker start zookeeper kafka
   
   # 3. Outbox Publisher
   docker start bloxtr8-outbox-publisher
   
   # 4. Escrow Service
   docker start bloxtr8-escrow-service
   
   # 5. API Gateway
   docker start bloxtr8-api-gateway
   ```

3. **Verify Service Health:**
   - Check health endpoints
   - Verify database connectivity
   - Verify Kafka connectivity
   - Run smoke tests

4. **Monitor Closely:**
   - Watch error rates
   - Monitor consumer lag
   - Check for data inconsistencies

**Post-Recovery:**
1. Document outage cause
2. Review incident response
3. Update runbooks with lessons learned
4. Implement prevention measures

## Additional Resources

- [Deployment Documentation](../deployment/escrow-services.md)
- [Escrow Service Design Document](../design/escrow/escrow-service-design.md)
- [API Gateway Design Document](../design/escrow/api-gateway-design.md)
- [Database Schema Documentation](../architecture/database-schema.md)

## On-Call Contact Information

- **Primary On-Call**: [Contact Information]
- **Escalation**: [Contact Information]
- **Emergency**: [Contact Information]

## Change Log

- 2025-01-02: Initial runbook creation

