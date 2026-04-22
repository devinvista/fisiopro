# components/domain

Componentes de **domínio reutilizáveis** — agrupados por contexto de negócio
(diferente de `components/ui/`, que contém primitivos do design system).

## Convenção

```
components/domain/
  patients/      ← cards, badges, avatares de paciente
  appointments/  ← chips de status, slots, confirmações
  billing/       ← KPIs financeiros, badges de status de cobrança
  catalog/       ← badges de categoria, margem, pacote
```

## Quando promover algo para cá

Mova um componente de `pages/<feature>/components/` para
`components/domain/<dominio>/` quando ele:

1. for usado em **2 ou mais features** distintas;
2. representar um **conceito de negócio** (paciente, agendamento, cobrança),
   não um primitivo de UI;
3. não tiver dependência direta de uma página específica.

## O que NÃO colocar aqui

- Primitivos genéricos (`Button`, `Card`, `Dialog`) → `components/ui/`
- Layouts e shells → `components/layout/`
- Guards de rota → `components/guards/`
- Componentes usados em apenas 1 página → manter dentro da própria feature
