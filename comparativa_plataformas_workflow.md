# ⚖️ Comparativa: Temporal vs Cadence vs Camunda vs Drools
### Para el flujo GoDigitalBack — PaymentRequest

---

## Veredicto rápido

| Plataforma | Para GoDigitalBack | Stack fit | Complejidad setup |
|---|---|---|---|
| **Temporal** | ✅ **RECOMENDADO** | TypeScript nativo | Baja (ya lo tienes) |
| Camunda 8 | 🟡 Válido, over-engineered | TypeScript via gRPC | Alta |
| Cadence | 🟡 Casi igual a Temporal | TypeScript limitado | Media |
| Drools | ❌ Herramienta equivocada | Java, no TS | Muy alta |

---

## 1. Análisis de cada plataforma

### 🟣 Temporal

**Qué es:** Plataforma de ejecución durable. Los workflows son **código TypeScript/Go/Python** que Temporal garantiza que se ejecuten incluso si el servidor cae.

**Modelo mental:** *"Tu código de negocio, pero indestructible."*

```
Tu código TypeScript normal
    +
Durabilidad automática (Temporal persiste cada paso)
    +
Reintentos configurables
    +
UI de monitoreo incluida
```

**Fortalezas para tu caso:**
- ✅ Cada `PaymentRequest` = 1 instancia de workflow con su propio ciclo de vida
- ✅ Los estados `pending → approved → authorized → paid` son señales naturales de Temporal
- ✅ El historial de quién aprobó/autorizó/pagó queda automáticamente en el event log
- ✅ TypeScript de primera clase (idéntico a tu stack actual)
- ✅ El timer de "rechazar si nadie aprueba en X días" es un [sleep()](file:///c:/Users/eduar/Desktop/Chinese%20Method/temporal-suite/workflows/src/activities.ts#63-66) de 1 línea
- ✅ Ya está corriendo en tu infraestructura

**Debilidades:**
- ❌ No tiene editor visual de diagramas para no-técnicos
- ❌ El concepto de "sandboxed workflow" puede confundir al principio

---

### 🔵 Camunda (versión 8 / Zeebe)

**Qué es:** Motor de procesos basado en **BPMN** (notación gráfica estándar de la industria). Defines el flujo como un diagrama XML/BPMN y el motor lo ejecuta.

**Modelo mental:** *"Dibuja el proceso en un diagrama y el motor lo sigue."*

```xml
<!-- El workflow es XML/BPMN, no código -->
<userTask id="aprobar" name="Aprobar Solicitud">
  <documentation>Revisar y aprobar el pago</documentation>
</userTask>
```

**Fortalezas:**
- ✅ Diagrama BPMN legible para personas de negocio no técnicas
- ✅ DMN (Decision Model and Notation) para reglas complejas de aprobación
- ✅ Muy maduro, usado en banca y seguros
- ✅ Camunda Modeler (editor visual gratuito)
- ✅ Audit trail completo incluido

**Debilidades para tu caso:**
- ❌ **Over-engineered** para un flujo de 4 pasos lineales
- ❌ Tu equipo necesita aprender BPMN además de TypeScript
- ❌ Camunda 8 requiere Zeebe, Elasticsearch, Operate, Tasklist — mucho más infraestructura
- ❌ Integración con MongoDB requiere trabajo manual (los conectores son enterprise/pagos)
- ❌ El SDK de TypeScript existe pero es más verbose y menos maduro que Temporal

**Cuándo elegirías Camunda sobre Temporal:**
- Cuando el equipo de negocio necesita diseñar/modificar el flujo sin código
- Cuando tienes > 20 pasos con ramificaciones complejas y múltiples pools/lanes (RRHH, Finanzas, Legal)
- Cuando necesitas cumplimiento regulatorio con auditorías BPMN certificadas

---

### 🟤 Cadence (Uber)

**Qué es:** El **ancestro directo de Temporal**. Temporal fue creado por los mismos autores de Cadence cuando salieron de Uber.

**Contexto histórico:**
```
Uber crea Cadence (2017)
    ↓
Equipo deja Uber, funda Temporal Technologies
    ↓
Temporal (2019) = Cadence + mejoras sustanciales
```

**Por qué NO elegir Cadence hoy:**
- ❌ El SDK de TypeScript de Cadence es muy limitado vs Temporal's
- ❌ Menor comunidad y desarrollo activo
- ❌ Mismos conceptos que Temporal, pero peores herramientas
- ❌ La documentación es inferior
- ✅ Único caso a favor: si ya tienes Cadence en producción y no quieres migrar

> [!CAUTION]
> No tiene ningún sentido usar Cadence para un proyecto nuevo.
> Temporal es literalmente Cadence evolucionado. No hay ventaja técnica ni de comunidad.

---

### 🔴 Drools (Red Hat / jBPM)

**Qué es:** Un **Motor de Reglas de Negocio (BRE)**, no un orquestador de flujos. Su propósito principal es evaluar reglas complejas sobre datos.

**Modelo mental:** *"Si el cliente tiene score > 650 Y deuda < 30% de ingresos Y tiene trabajo estable ENTONCES aprobar crédito."*

```java
// Drools Rule Language (DRL) — esto es Java, no TypeScript
rule "Aprobar pago de monto alto"
  when
    PaymentRequest(total > 10000, status == "pending")
    Employee(role == "superadmin" || role == "project_owner")
  then
    paymentRequest.setStatus("pre_approved");
end
```

**El problema fundamental:**

Drools resuelve **"¿qué decisión tomar?"**, no **"¿cómo orquestar el flujo?"**. Son herramientas diferentes:

| | Drools (Rules Engine) | Temporal (Workflow Engine) |
|---|---|---|
| Pregunta que responde | ¿Esta transacción se aprueba? | ¿Qué hace el sistema después de la aprobación? |
| Tiempo de ejecución | Milisegundos | Días/semanas |
| Estado persistente | No | Sí |
| Esperar input humano | No | Sí |
| Reintentos de fallo | No | Sí |

**Para tu caso GoDigitalBack:**
- ❌ Java-centric en un stack 100% TypeScript/Node.js
- ❌ Necesitarías un microservicio Java separado
- ❌ No maneja estados durables ni esperas humanas
- ❌ No tiene noción de "workflow" como secuencia en el tiempo
- ✅ Única ventaja hipotética: si tuvieras reglas de aprobación muy complejas (ej: aprobar automáticamente si `total < 500 AND proveedor es de categoría A AND es del Q4`)

**¿Se puede combinar con Temporal?**
Sí, pero solo si lo necesitas:
```
Temporal Workflow (orquestación/espera)
    → llama Activity
        → Activity consulta Drools (reglas de aprobación automática)
        → si Drools dice "auto-aprobar" → sigue el flujo
        → si Drools dice "requiere humano" → espera Signal
```
Para tu flujo actual, esto sería sobre-ingeniería innecesaria.

---

## 2. Evaluación contra GoDigitalBack PaymentRequest

### Criterios específicos de tu sistema

| Criterio | Peso | Temporal | Camunda 8 | Cadence | Drools |
|---|---|---|---|---|---|
| Stack TypeScript/Node.js | Alto | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐ |
| Multi-tenant MongoDB | Alto | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐ |
| Estado machine 4 pasos | Alto | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐ |
| Aprobación humana (Signal) | Alto | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ❌ |
| Notificaciones email | Medio | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ❌ |
| Audit trail automático | Alto | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ❌ |
| Simplicidad de setup | Medio | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ | ⭐ |
| Timers durables | Medio | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ❌ |
| UI de monitoreo | Medio | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ | ❌ |
| **TOTAL** | | **44/45** | **34/45** | **38/45** | **3/45** |

> [!IMPORTANT]
> **Temporal gana** no solo por puntuación, sino porque ya está en tu infraestructura
> y comparte exactamente el mismo stack tecnológico que tu backend GoDigitalBack.

---

## 3. Blueprint: GoDigitalBack en Temporal

Así se traduce exactamente tu sistema a Temporal:

### Mapeo de conceptos

```
PaymentRequest document (MongoDB)    →   Workflow instance
status field                         →   Estado interno del workflow
PUT /approve endpoint llamado        →   Signal 'aprobar' enviada al workflow
PUT /authorize endpoint llamado      →   Signal 'autorizar' enviada
PUT /pay endpoint llamado            →   Signal 'pagar' enviada
PUT /reject endpoint llamado         →   Signal 'rechazar' enviada
GET /payment-requests/:id            →   Query del estado del workflow
Email notifications                  →   Activities de Temporal
Audit fields (approved_by, etc.)     →   Guardado en MongoDB por Activities
```

### Estructura de código propuesta

```typescript
// workflows/src/paymentRequest/workflow.ts

import { proxyActivities, defineSignal, defineQuery, setHandler, condition, log } from '@temporalio/workflow';
import type * as acts from './activities';
import type { PaymentRequest, PRStatus } from './types';

const activities = proxyActivities<typeof acts>({
  startToCloseTimeout: '30 seconds',
  retry: { maximumAttempts: 3 },
});

// ── Señales (una por transición de estado) ──────────────────────────────
export const aprobarSignal    = defineSignal<[{ userId: string; notes?: string }]>('aprobar');
export const autorizarSignal  = defineSignal<[{ userId: string; paymentDate: Date; bankAccountId: string; notes?: string }]>('autorizar');
export const pagarSignal      = defineSignal<[{ userId: string; paymentProof: string; notes?: string }]>('pagar');
export const rechazarSignal   = defineSignal<[{ userId: string; reason: string }]>('rechazar');

// ── Query para consultar estado actual ──────────────────────────────────
export const estadoQuery = defineQuery<PRStatus>('estado');

// ── El workflow de PaymentRequest ───────────────────────────────────────
export async function paymentRequestWorkflow(pr: PaymentRequest): Promise<void> {
  const ctx = {
    status: 'pending' as PRStatus,
    aprobacion: null as { userId: string; notes?: string } | null,
    autorizacion: null as { userId: string; paymentDate: Date; bankAccountId: string; notes?: string } | null,
    pago: null as { userId: string; paymentProof: string; notes?: string } | null,
    rechazo: null as { userId: string; reason: string } | null,
  };

  setHandler(estadoQuery, () => ctx.status);

  setHandler(aprobarSignal,   (data) => ctx.aprobacion  = data);
  setHandler(autorizarSignal, (data) => ctx.autorizacion = data);
  setHandler(pagarSignal,     (data) => ctx.pago        = data);
  setHandler(rechazarSignal,  (data) => ctx.rechazo     = data);

  // ── PASO 1: Crear → PENDING ──────────────────────────────────────────
  await activities.guardarPaymentRequest(pr);
  await activities.notificarCreacion(pr);
  log.info('PR creada, esperando aprobación', { prId: pr._id });

  // ── PASO 2: PENDING → APPROVED (esperar hasta 7 días) ─────────────────
  const aprobada = await condition(
    () => ctx.aprobacion !== null || ctx.rechazo !== null,
    '7 days'
  );

  if (!aprobada || ctx.rechazo) {
    ctx.status = ctx.rechazo ? 'rejected' : 'rejected';
    await activities.procesarRechazo(pr, ctx.rechazo ?? { userId: 'system', reason: 'Timeout: sin respuesta en 7 días' });
    return;
  }

  ctx.status = 'approved';
  await activities.procesarAprobacion(pr, ctx.aprobacion!);
  log.info('PR aprobada, esperando autorización', { prId: pr._id });

  // ── PASO 3: APPROVED → AUTHORIZED (esperar hasta 5 días) ─────────────
  const autorizada = await condition(
    () => ctx.autorizacion !== null || ctx.rechazo !== null,
    '5 days'
  );

  if (!autorizada || ctx.rechazo) {
    ctx.status = 'rejected';
    await activities.procesarRechazo(pr, ctx.rechazo ?? { userId: 'system', reason: 'Timeout en autorización' });
    return;
  }

  ctx.status = 'authorized';
  await activities.procesarAutorizacion(pr, ctx.autorizacion!);
  log.info('PR autorizada, esperando pago', { prId: pr._id });

  // ── PASO 4: AUTHORIZED → PAID (esperar hasta 3 días) ─────────────────
  const pagada = await condition(
    () => ctx.pago !== null || ctx.rechazo !== null,
    '3 days'
  );

  if (!pagada || ctx.rechazo) {
    ctx.status = 'rejected';
    await activities.procesarRechazo(pr, ctx.rechazo ?? { userId: 'system', reason: 'Timeout en pago' });
    return;
  }

  ctx.status = 'paid';
  await activities.procesarPago(pr, ctx.pago!);
  log.info('PR pagada ✅', { prId: pr._id });
}
```

### Integración con tu API Express existente

```typescript
// En tu controller Express — paymentRequest.ts
// No reemplazas tu código actual, solo llamas a Temporal

import { Client, Connection } from '@temporalio/client';
import { paymentRequestWorkflow, aprobarSignal, rechazarSignal } from '../workflows/paymentRequest/workflow';

// Singleton del cliente Temporal (inicializar al arrancar el server)
const temporalClient = await Connection.connect({ address: process.env.TEMPORAL_ADDRESS || 'localhost:7233' });
const client = new Client({ connection: temporalClient });

// POST /payment-requests — Crear una nueva PR
export const createPaymentRequest = async (req, res) => {
  // ... tu lógica actual de validación y guardado en MongoDB ...
  const saved = await new PaymentRequestModel(data).save();

  // Iniciar el workflow de Temporal con el mismo ID que el documento de MongoDB
  await client.workflow.start(paymentRequestWorkflow, {
    taskQueue: 'payment-requests',
    workflowId: `pr-${saved._id.toString()}`,  // ID = ID de Mongo → fácil de encontrar
    args: [saved.toObject()],
  });

  return res.status(201).json(saved);
};

// PUT /payment-requests/:id/approve — Aprobar
export const approvePaymentRequest = async (req, res) => {
  // ... tu validación de rol actual ...
  const handle = client.workflow.getHandle(`pr-${req.params.id}`);
  
  await handle.signal(aprobarSignal, {
    userId: req.userId,
    notes: req.body.notes,
  });

  return res.json({ message: 'Aprobación enviada al flujo' });
};

// Similar para authorize, pay, reject...
```

### Ventaja clave: tus endpoints HTTP siguen funcionando igual

```
Tu API REST                    Temporal
──────────────                 ──────────────────────────
POST /payment-requests   →     client.workflow.start(...)
PUT /:id/approve         →     handle.signal(aprobarSignal)
PUT /:id/authorize       →     handle.signal(autorizarSignal)
PUT /:id/pay             →     handle.signal(pagarSignal)
PUT /:id/reject          →     handle.signal(rechazarSignal)
GET /:id (estado)        →     handle.query(estadoQuery)
```

Tu frontend no cambia nada. Tu API no cambia nada. Temporal corre detrás.

---

## 4. Lo que ganas con Temporal sobre tu implementación actual

| Capacidad | Sin Temporal (actual) | Con Temporal |
|---|---|---|
| Estado persistente | Campo `status` en MongoDB | Temporal + MongoDB |
| Quién aprobó/cuándo | Campos manuales en el doc | Event log automático en UI |
| Re-envío de emails si fallan | Lógica manual o ninguna | Reintentos automáticos configurables |
| Timeout automático (sin respuesta) | Cron job manual | `condition(..., '7 days')` — 1 línea |
| Flujo observable | Consultas SQL/Mongo ad-hoc | UI visual con timeline completo |
| Traza de auditoría | Campos `approved_by`, etc. | Event history inmutable de Temporal |
| Resistencia a caídas del servidor | Ninguna (el pago puede perderse) | El workflow retoma exactamente donde estaba |

---

## 5. ¿Y si quiero reglas de aprobación automáticas? (donde entraría Drools)

Si en el futuro GODB necesita aprobar automáticamente basado en reglas complejas, la arquitectura sería:

```
Temporal Workflow
    │
    ├── Activity: evaluarReglas(paymentRequest)
    │       │
    │       └── Llama a microservicio de reglas (puede ser Drools, o simple if/else)
    │               • if total < 500 && proveedor.categoria === 'A' → auto_aprobar
    │               • if total > 10000 → requiere_2_aprobadores
    │               • else → flujo normal
    │
    └── Si auto_aprobar → continúa el workflow
        Si requiere_humano → espera Signal de UI
```

Pero para tu caso actual: las reglas son simples (tiene permiso de project_owner ó superadmin). No necesitas Drools.

---

## Decisión final

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   Para GoDigitalBack PaymentRequest:  USA TEMPORAL             │
│                                                                 │
│   ✅ Ya está corriendo en tu infraestructura                   │
│   ✅ TypeScript nativo = integración directa con tu API        │
│   ✅ El modelo signals/workflow mapea perfecto a tu state machine│
│   ✅ Audit trail, timers y reintentos gratis                   │
│   ✅ UI de monitoreo incluida para ver cada PR en tiempo real   │
│                                                                 │
│   Camunda: válido pero over-engineered para 4 pasos lineales   │
│   Cadence:  descártalo, Temporal es Cadence mejorado           │
│   Drools:   herramienta incorrecta — es para reglas, no flujos │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```
