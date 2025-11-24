# Cisco ISE Architecture Facts

- **Deployment model:** Two PSNs at HQ, one PSN at Branch; dual MnTs; single PAN. YAML config drives nodes, layers, colors, and simulations.
- **Site labels:** `Headquarters` and `Remote Branch`.
- **Core roles:** PAN (config master, DB replication), PSN (runtime AAA and profiling), MnT (logging/ops), Infra (AD/DNS/PKI/DHCP), Endpoint (supplicants).

## Critical Protocols & Ports
- **Admin plane:** TCP 12001 (PAN→PSN config push), TCP 12001 (PAN→PSN3 over WAN dashed), Log DB replication TCP 1521 (MnT1↔MnT2).
- **AAA:** RADIUS UDP 1812 (Auth) / 1700 (CoA); TACACS+ TCP 49.
- **Logging:** Secure Syslog via ISE Messaging Service (RabbitMQ TLS) TCP 8671.
- **Identity/DNS:** Kerberos 88; DNS 53 (local and WAN fallback).
- **Profiling:** DHCP helper copies to PSN (relay + probe); Option 55/60 inspection.
- **PKI:** OCSP/CRL from PSNs to CA (WAN for branch).

## Flows Represented in Simulators
- **EAP-TLS Auth (Branch):** `pc → sw-br → psn3 → ad-br → psn3 → sw-br`.
- **TACACS+ Admin:** `sw-br → psn3 → ad-br → psn3 → sw-br`.
- **TACACS+ Fallback (WAN):** `sw-br → psn1 → ad → psn1 → sw-br`.
- **Device Profiling (DHCP):** `phone-mab → sw-br → dhcp-br → psn3 → sw-br`.
- **Secure Logging (WAN):** `psn3 → mnt1`.
- **Session Replication (LDD):** `psn3 → psn2 → psn1 → psn2 → psn3`.
- **Admin & Log Sync:** `pan1 → mnt1 → mnt2`.

## Ops Notes
- **Layer filters:** Layers are toggled in the UI; WAN paths marked dashed. Default panels start collapsed.
- **Panning/zooming:** Canvas transforms are applied; packet animation converts SVG coords to viewport to keep dots on-path.
- **Editing guidance:** Keep IDs in `kebab-case`; reuse existing `nodeTypes` and color vars; connections require both nodes to exist.
- **Refresh checks:** After YAML edits, ensure tooltips, inspector detail, and simulator paths align with defined connections. Use `./serve.sh` for a local preview on port 8000.

## Reliability & HA Highlights
- **PAN HA:** Active/standby PANs; replication rides TCP 12001. Health-check nodes trigger failover; latency budget ~300ms.
- **PSN Groups:** Place PSNs in node groups for LDD-based session replication; load balancers need sticky sessions (Calling-Station-ID).
- **MnT HA:** Primary/secondary MnT both collect logs; keep MnT persona dedicated; back up/restore between them to sync history.
- **Profiling & Session Data:** Light Data Distribution (RSD/EPOD) replicates CoA-critical session attributes and endpoint ownership across PSNs; tune batch size/TTL in LDD settings.

## Logging & Drops
- **Syslog Survivability:** “Use ISE Messaging Service for UDP Syslogs to MnT” secures/buffers syslogs (TCP 8671) for ~2.5 hours if MnT is down; Secure Syslog listens on TCP 6514.
- **Drop Conditions:** RADIUS drops surface as 5405/5413 when PSN can’t process or NAD/identity store unreachable; unreachable AD can be set to DROP. Lack of LB stickiness leads to mid-session state errors (e.g., “EAP packet from middle of conversation”).
- **Load/Debug Impact:** Excessive debug logging or NAD syslogs sent directly to MnT can overload and cause queue/link errors; use external syslog for NADs.

## Secure Transport
- **Campus vs WAN:** Use MACsec at L2 where hardware supports; IPsec/DTLS for routed/WAN or TACACS+/AAA links.
- **IPsec:** Native IPsec between PSN and NAD (IKEv1/v2), limited to ~50 tunnels per PSN; required for FIPS IP-layer protection.
- **RADIUS DTLS:** Dedicated encryption for RADIUS if mandated; requires certs on PSN and NAD.
- **TrustSec Context:** SGT-based segmentation still applies; crypto overlays protect paths, policy decides access.

## EAP-TLS Essentials
- **Certificates:** PSN needs an EAP Authentication–role cert (2048-bit recommended); client certs must chain to trusted CAs marked “Trust for client authentication/Syslog.” EST or external CA can issue.
- **Flow:** Supplicant sends cert via NAD → RADIUS Access-Request (UDP 1812, optional DTLS). PSN presents its EAP cert, mutual TLS validates chains, then policy engine evaluates authN/authZ (can pull AD/profile attributes).
- **Controls:** ISE can limit failed EAP-TLS attempts per identity; disabled/locked identities fail auth.
- **Enforcement:** Access-Accept applies VLAN/DACL/SGT via authorization profile; CoA handles changes. Cert attributes (CN/O), AD groups, and profiling data can drive policy.

## Monitoring Targets
- **MnT as Log Collector:** All ISE nodes send logs to primary/secondary MnT. Avoid pointing NAD syslogs to MnT; prefer Secure Syslog collectors or external SIEM.
- **Port Reminders:** Admin/API 443, replication 12001, CoA 1700, RADIUS 1812/1813, TACACS+ 49, Secure Syslog 6514, Messaging Service 8671, pxGrid 5222/8910, DHCP probe 67, DNS 53, OCSP 2560.

## Core Services & Troubleshooting Cues
- **Database Listener/Server:** Must be up before other services; if stuck initializing, restart `application stop|start ise`; TAC for corruption/reset.
- **App Server/UI:** Drives admin UI/business logic; long init can be cert or sync issues—verify Admin cert validity and node sync.
- **Profiler DB & MFC Profiler:** Store profiling data; ensure probes enabled; logs: `profiler.log`, `ise-pi-profiler.log`.
- **Indexing Engine:** Powers Context Visibility search; needs working DNS/NTP/Admin certs; check `ADE.log`.
- **AD Connector:** Bridges to AD via LDAPS; time skew <5 min; reports under Operations → Diagnostics.
- **LDD (RSD/EPOD):** Under Admin > System > Settings > Light Data Distribution; on by default for session/endpoint ownership replication.
- **Messaging Service:** Internal TLS queue on 8671; queue link errors often cert/rabbitmq issues.
- **Log Pipeline:** MnT Session DB and Log Processor handle live logs/sessions; heavy debug/NAD syslogs can overwhelm—prune categories, use external syslog.
- **Log Analytics Stack:** Elasticsearch/Logstash/Kibana + Prometheus/Grafana/Node Exporter; disable/enable Log Analytics to reset; check `prometheus.log`, `logstash.log`, `grafana.log`.
- **Security Services:** Native IPsec (PSN↔NAD tunnels, IKEv1/v2), RADIUS DTLS role, SXP Engine for SGT exchange, pxGrid Direct for context sharing, TC-NAC for third-party NAC, REST Auth for API-based auth.

## Deployment & Personas
- **Models:** Standalone (all roles, no persona edits, ~50k endpoints), basic two-node HA, or distributed (central Admin/MnT, distributed PSNs, up to ~2M endpoints).
- **PAN:** Only Primary is writable; Secondary is standby. Auto-failover needs a non-admin health-check node. PAN replicates config/certs to all nodes; manage system certs centrally.
- **PSN:** Enforcement for RADIUS/TACACS, posture, guest, profiling; up to 50 PSNs. Profiling writes locally, remote writes only on significant attribute change; group PSNs for LDD session failover.
- **MnT:** Log collector; up to two (primary/secondary) with both receiving logs. Keep persona dedicated; back up/purge monitoring DB separately.
- **pxGrid:** Context sharing/ANC; up to four nodes. Registration pauses if Primary PAN is down until promotion.
- **Prereqs:** Common NTP, forward/reverse DNS for all nodes, same ISE version, and ~300 ms latency budget PAN↔other nodes.

## PSN Runtime & Flows
- **prrt-server pools:** Main handles I/O and Message-Authenticator checks; Policy runs policy sets/identity source selection; Reactor/ADIDStore manages async external lookups; EapTls handles TLS crypto. High auth latency with low CPU usually means waiting on AD/identity sources.
- **Decision path:** RADIUS request → NAD cache lookup → policy set → identity source → async queries → authorization rule match → Access-Accept/Reject + optional CoA. Unknown NAD (11007) or bad secrets drop early.
- **CoA:** PSN-originated CoA on UDP 1700/3799. Admin-triggered CoA signals the session-owning PSN internally before North-South CoA; load balancers/NADs must trust real PSN IPs or SNAT the return.

## MnT Pipeline
- **Collector vs Processor:** Collector ingests UDP 20514/TCP 6514 into a buffer; Processor parses, correlates sessions, writes operational/reporting stores. Buffer exhaustion drops UDP logs and causes Live Log gaps.
- **Live Log queries:** PAN proxies admin views to primary MnT REST/API. Dead MnT blinds dashboards but PSNs keep authenticating and fail over log ingestion to secondary.

## East-West Transport
- **Config replication:** JGroups on TCP 12001 for change signaling; Oracle/Data Guard on TCP 1521 for bulk sync (TLS-wrapped in newer builds).
- **Session/profiling mesh:** LDD uses RabbitMQ over TCP 8671 (not 5672) to publish profiling/session ownership; PSN node groups use JGroups/Redis for heartbeats.
- **Latency/firewalls:** Blocking 12001/8671/7800 breaks clustering/profiling; keep PAN↔PSN latency <300 ms.
