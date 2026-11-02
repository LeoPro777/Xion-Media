---
trigger: always_on
---

# Guía de Optimización y Reducción de Tokens para Agentes IA en Antigravity

Este documento establece las directrices estrictas de comportamiento, comunicación y desarrollo seguro para los agentes de Inteligencia Artificial que operan en **Antigravity**. Su propósito fundamental es maximizar la eficiencia en el consumo de tokens, garantizar la estabilidad del código existente y mantener rigurosos estándares internacionales de programación y seguridad.

---

## 1. Principios Rector de Respuesta (Eficiencia de Tokens)

Los agentes deben minimizar drásticamente el consumo de tokens en cada interacción. Se prohíbe el uso de saludos redundantes, introducciones extensas, explicaciones de conceptos básicos o reflexiones innecesarias.

### 1.1. Estructura Obligatoria de Respuesta
Toda respuesta de código o refactorización debe limitarse exclusivamente a dos secciones concisas:
1. **Qué se hizo:** Breve descripción técnica de la acción realizada (máximo 1-2 líneas).
2. **Qué cambió:** Listado directo de modificaciones, adiciones o correcciones aplicadas.

### 1.2. Directrices de Formato de Código
* **No tocar lo que funciona:** Queda estrictamente prohibido modificar, refactorizar o reestructurar código, funciones, componentes o lógica que ya se encuentren funcionando correctamente, a menos que sea un requerimiento de seguridad crítico o dependiente directo de la tarea.
* **Snippets Quirúrgicos:** No se debe devolver el archivo completo o bloques kilométricos de código si solo se modificaron líneas específicas. Utilice fragmentos mínimos y directos acompañados del contexto indispensable.

---

## 2. Estándares de Seguridad Primero ("Security-First")

La seguridad es el pilar central en cada ciclo de desarrollo. Los agentes deben aplicar los principios de *Defense in Depth* y *Secure by Design* desde la concepción del código.

* **Validación y Sanitización Estricta:** Todo dato de entrada (*inputs*) proveniente de usuarios, APIs externas o fuentes no confiables debe ser estrictamente validado, sanitizado y tipado (ej. mediante Pydantic, Zod o esquemas equivalentes según el stack).
* **Gestión Segura de Secretos:** Nunca codificar credenciales, claves de API, tokens de acceso o cadenas de conexión directamente en el código fuente (*hardcoded*). Utilice siempre variables de entorno (`.env`) con validación de existencia en el arranque.
* **Control de Acceso y Principio de Privilegio Mínimo:** Los componentes, endpoints y consultas a bases de datos deben restringir los permisos al mínimo nivel operativo necesario.
* **Prevención de Vulnerabilidades Comunes:** Todo código generado debe mitigar activamente riesgos OWASP Top 10 (Inyección SQL/NoSQL, XSS, CSRF, exposición de datos sensibles y control de flujo inseguro).

---

## 3. Cumplimiento de Estándares Internacionales de Programación

El código generado en Antigravity debe cumplir rigurosamente con normativas y convenciones de la industria para garantizar mantenibilidad, legibilidad y robustez:

* **Clean Code & SOLID:** Funciones y métodos de responsabilidad única, acoplamiento bajo y alta cohesión.
* **Tipado Estricto:** Uso obligatorio de tipado estático (TypeScript, Python type hints, etc.) para prevenir errores de ejecución y facilitar el análisis estático.
* **Manejo Robusto de Excepciones:** Captura controlada de errores sin exponer trazas de pila (*stack traces*) sensibles hacia el cliente final; registro estructurado (*logging*) de excepciones para auditoría.
* **Docs-as-Code y Documentación Mínima:** Comentarios y documentación estrictamente limitados a lógica compleja o de negocio no evidente, cumpliendo con los estándares de documentación del repositorio.

d