# schemas/

Schemas Zod de **validação de formulário** do frontend.

## Convenção

Um arquivo por feature, nomeado `<feature>.schema.ts`. Cada arquivo exporta:

- o schema Zod (`xxxFormSchema`)
- o tipo inferido (`XxxFormValues = z.infer<typeof xxxFormSchema>`)
- valores padrão (`xxxFormDefaults`) quando aplicável

```ts
// schemas/patient.schema.ts
import { z } from "zod";

export const patientFormSchema = z.object({
  fullName: z.string().min(2, "Nome obrigatório"),
  birthDate: z.string().date(),
  cpf: z.string().regex(/^\d{11}$/, "CPF inválido"),
});

export type PatientFormValues = z.infer<typeof patientFormSchema>;

export const patientFormDefaults: Partial<PatientFormValues> = {
  fullName: "",
  cpf: "",
};
```

## Por que separar dos contratos do backend?

`@workspace/api-zod` contém os contratos de **API** (request/response do
servidor). Os schemas aqui são de **UX**: mensagens em pt-BR, regras condicionais
de UI, máscaras. Eles podem importar e estender os schemas de `api-zod`
quando fizer sentido, mas vivem separados para evitar acoplamento.

## Uso com react-hook-form

```ts
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { patientFormSchema, patientFormDefaults } from "@/schemas/patient.schema";

const form = useForm({
  resolver: zodResolver(patientFormSchema),
  defaultValues: patientFormDefaults,
});
```
