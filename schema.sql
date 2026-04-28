-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tabla Personas
CREATE TABLE personas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre_apellido TEXT NOT NULL,
  telefono TEXT,
  ubicacion TEXT,
  rol TEXT CHECK (rol IN ('Comprador', 'Vendedor', 'Ambos')),
  capital_disponible DECIMAL(15,2),
  tipo_buscado TEXT,
  descripcion_libre TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla Campos
CREATE TABLE campos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_propietario UUID REFERENCES personas(id) ON DELETE CASCADE,
  ubicacion_exacta TEXT,
  superficie_ha DECIMAL(10,2),
  tipo TEXT,
  precio DECIMAL(15,2),
  parcelas_catastro TEXT,
  descripcion_tecnica TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla Oportunidades
CREATE TABLE oportunidades (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_persona UUID REFERENCES personas(id) ON DELETE CASCADE,
  id_campo UUID REFERENCES campos(id) ON DELETE SET NULL,
  tipo TEXT CHECK (tipo IN ('Compra', 'Venta')),
  monto DECIMAL(15,2),
  zona TEXT,
  requisitos TEXT,
  parte_pago TEXT,
  estado TEXT DEFAULT 'activa',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS para Personas
ALTER TABLE personas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir lectura pública a todos"
  ON personas FOR SELECT
  USING (true);

CREATE POLICY "Permitir inserción a todos"
  ON personas FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Permitir actualización a todos"
  ON personas FOR UPDATE
  USING (true);

CREATE POLICY "Permitir eliminación a todos"
  ON personas FOR DELETE
  USING (true);

-- RLS para Campos
ALTER TABLE campos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir lectura pública a todos"
  ON campos FOR SELECT
  USING (true);

CREATE POLICY "Permitir inserción a todos"
  ON campos FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Permitir actualización a todos"
  ON campos FOR UPDATE
  USING (true);

CREATE POLICY "Permitir eliminación a todos"
  ON campos FOR DELETE
  USING (true);

-- RLS para Oportunidades
ALTER TABLE oportunidades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir lectura pública a todos"
  ON oportunidades FOR SELECT
  USING (true);

CREATE Policy "Permitir inserción a todos"
  ON oportunidades FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Permitir actualización a todos"
  ON oportunidades FOR UPDATE
  USING (true);

CREATE POLICY "Permitir eliminación a todos"
  ON oportunidades FOR DELETE
  USING (true);
