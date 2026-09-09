# Avistar Dashboard

Dashboard comercial da Clínica Avistar, integrado ao Kommo CRM. Projeto novo e independente — não reutiliza nenhum dos outros dashboards da Avistar.

## Rodando localmente

```bash
python -m venv .venv
.venv/Scripts/activate   # Windows
pip install -r requirements.txt
cp .env.example .env     # preencha KOMMO_TOKEN e o resto
python app.py
```

Abra http://localhost:5000

## Deploy no Render

1. **New +** → **Web Service** → conecte o repositório `avistar-dashboard`.
2. **Environment**: Python 3.
3. **Build Command**: `pip install -r requirements.txt`
4. **Start Command**: `gunicorn app:app`
5. Em **Environment Variables**, adicione:
   - `KOMMO_SUBDOMAIN` = `clinicaavistar`
   - `KOMMO_TOKEN` = (o long-lived token gerado no Kommo)
   - `CLINIC_NAME` = `Clínica Avistar`
   - `CLINIC_PHONE` = (opcional)
   - `CLINIC_SITE` = (opcional)
6. Deploy. O primeiro carregamento faz a sincronização inicial com o Kommo (leva alguns segundos, ~3 mil leads).

## Como os dados são calculados

- **Conversão** = ganhos / total de leads
- **Ganho/perdido** = status_id 142 (ganho) / 143 (perdido) — os IDs fixos do Kommo, independente do nome customizado do estágio
- **Médico** = campo "Especialista" do Kommo (não é aproximação — a Avistar tem esse campo dedicado)
- **Tipo de atendimento** = campo "Especialidade/Tipo" do Kommo
- **Leads parados** = leads em aberto sem atualização há mais de 5 dias, com score de risco = 60% peso em dias parado + 40% peso em valor do lead

O botão **Atualizar** força uma nova sincronização com o Kommo. Há também uma sincronização automática a cada 15 minutos em background.
