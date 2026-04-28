import { supabase, getCurrentUser } from './supabase';

export async function saveProducerData(jsonData) {
  console.log('Starting save to database...');
  console.log('Data to save:', JSON.stringify(jsonData, null, 2));

  try {
    const { persona, campo, oportunidad } = jsonData;
    
    const user = await getCurrentUser();
    const userId = user?.id;
    console.log('Current user ID:', userId);

    let personId = null;

    if (persona && (persona.telefono || persona.nombre_apellido || persona.email)) {
      console.log('Step A: Checking if person exists by phone or email...');
      
      if (persona.telefono) {
        console.log('Searching by phone:', persona.telefono);
        const { data: existingPerson } = await supabase
          .from('personas')
          .select('id, nombre_apellido, telefono, email, rol, ubicacion')
          .eq('telefono', persona.telefono)
          .maybeSingle();

        if (existingPerson) {
          personId = existingPerson.id;
          console.log('Person already exists by phone, ID:', personId);
          
          if (persona.email && !existingPerson.email) {
            await supabase.from('personas').update({ email: persona.email }).eq('id', personId);
            console.log('Email added to existing person');
          }
          
          return { status: 'SUCCESS', personId };
        }
        
        if (persona.email) {
          console.log('Phone not found, searching by email:', persona.email);
          const { data: emailMatch } = await supabase
            .from('personas')
            .select('id, nombre_apellido, telefono, email, rol, ubicacion')
            .eq('email', persona.email)
            .maybeSingle();
            
          if (emailMatch) {
            personId = emailMatch.id;
            console.log('Person found by email, ID:', personId);
            return { status: 'SUCCESS', personId };
          }
        }
        
        if (persona.nombre_apellido) {
          console.log('Phone/email not found, searching by name:', persona.nombre_apellido);
          const searchName = `%${persona.nombre_apellido}%`;
          const { data: matches, error: searchError } = await supabase
            .from('personas')
            .select('id, nombre_apellido, telefono, email, rol, ubicacion')
            .ilike('nombre_apellido', searchName)
            .order('nombre_apellido', { ascending: true });

          console.log('Search error:', searchError);
          console.log('Matches found:', matches?.length || 0, matches);
          if (matches && matches.length > 0) {
            console.log('Found matching persons:', matches.length);
            return { status: 'NEEDS_SELECTION', candidates: matches };
          }
        }
      } else if (persona.email) {
        console.log('No phone, searching by email:', persona.email);
        const { data: emailMatch } = await supabase
          .from('personas')
          .select('id, nombre_apellido, telefono, email, rol, ubicacion')
          .eq('email', persona.email)
          .maybeSingle();
          
        if (emailMatch) {
          personId = emailMatch.id;
          console.log('Person found by email, ID:', personId);
          return { status: 'SUCCESS', personId };
        }
        
        if (persona.nombre_apellido) {
          console.log('Email not found, searching by name:', persona.nombre_apellido);
          const { data: matches } = await supabase
            .from('personas')
            .select('id, nombre_apellido, telefono, email, rol, ubicacion')
            .ilike('nombre_apellido', `%${persona.nombre_apellido}%`);

          if (matches && matches.length > 0) {
            console.log('Found matching persons:', matches.length);
            return { status: 'NEEDS_SELECTION', candidates: matches };
          }
        }
      } else if (persona.nombre_apellido) {
        console.log('No phone or email, searching by name only:', persona.nombre_apellido);
        
        const { data: matches } = await supabase
          .from('personas')
          .select('id, nombre_apellido, telefono, email, rol, ubicacion')
          .ilike('nombre_apellido', `%${persona.nombre_apellido}%`);

        if (matches && matches.length > 0) {
          console.log('Found matching persons:', matches.length);
          return { status: 'NEEDS_SELECTION', candidates: matches };
        } else {
          console.log('No matches found and no phone provided');
          return { status: 'ERROR_NO_PHONE' };
        }
      }
      
      if (!personId && persona.nombre_apellido) {
        console.log('Step A: Inserting new person...');
        const { data: newPerson, error: personError } = await supabase
          .from('personas')
          .insert({
            nombre_apellido: persona.nombre_apellido || null,
            telefono: persona.telefono || null,
            email: persona.email || null,
            rol: persona.rol || null,
            ubicacion: persona.ubicacion || null,
            user_id: userId,
          })
          .select('id')
          .single();

        if (personError) {
          console.error('Error inserting person:', personError);
          throw new Error(`Error inserting person: ${personError.message}`);
        }

        personId = newPerson.id;
        console.log('New person created, ID:', personId);
      }
    } else {
      console.log('No person data to save');
    }

    let fieldId = null;

    if (campo) {
      console.log('Step B: Inserting field data...');
      
      let superficieHa = campo.superficie_ha;
      if (typeof superficieHa === 'string') {
        if (superficieHa.includes('[')) {
          superficieHa = parseFloat(superficieHa.replace('[', '').replace(']', '').split(',')[0]);
        } else {
          superficieHa = parseFloat(superficieHa) || null;
        }
      }

      let precio = campo.precio;
      if (typeof precio === 'string') {
        if (precio.includes('[')) {
          precio = parseFloat(precio.replace('[', '').replace(']', '').split(',')[0]);
        } else {
          precio = parseFloat(precio.replace(/[^0-9.]/g, '')) || null;
        }
      }
      
      const { data: newField, error: fieldError } = await supabase
        .from('campos')
        .insert({
          id_propietario: personId,
          ubicacion_exacta: campo.ubicacion_exacta || null,
          superficie_ha: superficieHa,
          tipo: campo.tipo || null,
          precio: precio,
          user_id: userId,
        })
        .select('id')
        .single();

      if (fieldError) {
        console.error('Error inserting field:', fieldError);
        throw new Error(`Error inserting field: ${fieldError.message}`);
      }

      fieldId = newField?.id;
      console.log('New field created, ID:', fieldId);
    } else {
      console.log('No field data to save');
    }

    if (oportunidad && personId) {
      console.log('Step C: Inserting opportunity data...');
      
      let pricePerHa = null;
      let totalBudget = null;
      
      if (oportunidad.price_per_ha) {
        pricePerHa = typeof oportunidad.price_per_ha === 'string' 
          ? parseFloat(oportunidad.price_per_ha.replace(/[^0-9.]/g, '')) 
          : oportunidad.price_per_ha;
      }
      
      if (oportunidad.total_budget) {
        totalBudget = typeof oportunidad.total_budget === 'string'
          ? parseFloat(oportunidad.total_budget.replace(/[^0-9.]/g, ''))
          : oportunidad.total_budget;
      }
      
      const { data: newOpportunity, error: opportunityError } = await supabase
        .from('oportunidades')
        .insert({
          id_persona: personId,
          id_campo: fieldId,
          tipo: oportunidad.tipo || null,
          price_per_ha: pricePerHa,
          total_budget: totalBudget,
          moneda: oportunidad.moneda || 'USD',
          zona: oportunidad.zona || null,
          requisitos: oportunidad.requisitos || null,
          estado: oportunidad.estado || 'Ingresada',
          user_id: userId,
        })
        .select('id')
        .single();

      if (opportunityError) {
        console.error('Error inserting opportunity:', opportunityError);
        throw new Error(`Error inserting opportunity: ${opportunityError.message}`);
      }

      console.log('New opportunity created, ID:', newOpportunity.id);
    } else {
      console.log('No opportunity data to save');
    }

    console.log('All data saved successfully!');
    return {
      status: 'SUCCESS',
      personId,
      fieldId,
      isNew: true,
    };

  } catch (error) {
    console.error('Error saving to database:', error);
    throw error;
  }
}

export async function saveDataWithSelectedPerson(personId, jsonData) {
  console.log('Starting save with selected person...');
  console.log('Person ID:', personId);
  console.log('Data to save:', JSON.stringify(jsonData, null, 2));

  try {
    const { campo, oportunidad } = jsonData;
    
    const user = await getCurrentUser();
    const userId = user?.id;
    console.log('Current user ID:', userId);

    let fieldId = null;

    if (campo) {
      console.log('Step B: Inserting field data...');
      
      let superficieHa = campo.superficie_ha;
      if (typeof superficieHa === 'string') {
        if (superficieHa.includes('[')) {
          superficieHa = parseFloat(superficieHa.replace('[', '').replace(']', '').split(',')[0]);
        } else {
          superficieHa = parseFloat(superficieHa) || null;
        }
      }

      let precio = campo.precio;
      if (typeof precio === 'string') {
        if (precio.includes('[')) {
          precio = parseFloat(precio.replace('[', '').replace(']', '').split(',')[0]);
        } else {
          precio = parseFloat(precio.replace(/[^0-9.]/g, '')) || null;
        }
      }
      
      const { data: newField, error: fieldError } = await supabase
        .from('campos')
        .insert({
          id_propietario: personId,
          ubicacion_exacta: campo.ubicacion_exacta || null,
          superficie_ha: superficieHa,
          tipo: campo.tipo || null,
          precio: precio,
          user_id: userId,
        })
        .select('id')
        .single();

      if (fieldError) {
        console.error('Error inserting field:', fieldError);
        throw new Error(`Error inserting field: ${fieldError.message}`);
      }

      fieldId = newField?.id;
      console.log('New field created, ID:', fieldId);
    } else {
      console.log('No field data to save');
    }

    if (oportunidad && personId) {
      console.log('Step C: Inserting opportunity data...');
      
      let pricePerHa = null;
      let totalBudget = null;
      
      if (oportunidad.price_per_ha) {
        pricePerHa = typeof oportunidad.price_per_ha === 'string' 
          ? parseFloat(oportunidad.price_per_ha.replace(/[^0-9.]/g, '')) 
          : oportunidad.price_per_ha;
      }
      
      if (oportunidad.total_budget) {
        totalBudget = typeof oportunidad.total_budget === 'string'
          ? parseFloat(oportunidad.total_budget.replace(/[^0-9.]/g, ''))
          : oportunidad.total_budget;
      }
      
      const { data: newOpportunity, error: opportunityError } = await supabase
        .from('oportunidades')
        .insert({
          id_persona: personId,
          id_campo: fieldId,
          tipo: oportunidad.tipo || null,
          price_per_ha: pricePerHa,
          total_budget: totalBudget,
          moneda: oportunidad.moneda || 'USD',
          zona: oportunidad.zona || null,
          requisitos: oportunidad.requisitos || null,
          estado: oportunidad.estado || 'Ingresada',
          user_id: userId,
        })
        .select('id')
        .single();

      if (opportunityError) {
        console.error('Error inserting opportunity:', opportunityError);
        throw new Error(`Error inserting opportunity: ${opportunityError.message}`);
      }

      console.log('New opportunity created, ID:', newOpportunity.id);
    } else {
      console.log('No opportunity data to save');
    }

    console.log('All data saved successfully!');
    return {
      status: 'SUCCESS',
      personId,
      fieldId,
      isNew: true,
    };

  } catch (error) {
    console.error('Error saving to database:', error);
    throw error;
  }
}

export async function updateOpportunityData(jsonData) {
  console.log('Starting update opportunity...');
  console.log('Data to update:', JSON.stringify(jsonData, null, 2));

  try {
    const { numero_oportunidad, oportunidad } = jsonData;

    if (!numero_oportunidad) {
      throw new Error('Número de oportunidad no proporcionado');
    }

    console.log('Step A: Finding opportunity by number...');
    
    const { data: existingOpportunity, error: findError } = await supabase
      .from('oportunidades')
      .select('id')
      .eq('numero', numero_oportunidad)
      .maybeSingle();

    if (findError) {
      console.error('Error finding opportunity:', findError);
      throw new Error(`Error finding opportunity: ${findError.message}`);
    }

    if (!existingOpportunity) {
      throw new Error(`No se encontró la oportunidad #${numero_oportunidad}`);
    }

    console.log('Opportunity found, ID:', existingOpportunity.id);

    console.log('Step B: Updating opportunity...');
    
    const updateData = {};
    
    if (oportunidad.tipo) updateData.tipo = oportunidad.tipo;
    if (oportunidad.price_per_ha) updateData.price_per_ha = parseFloat(oportunidad.price_per_ha) || null;
    if (oportunidad.total_budget) updateData.total_budget = parseFloat(oportunidad.total_budget) || null;
    if (oportunidad.moneda) updateData.moneda = oportunidad.moneda;
    if (oportunidad.zona) updateData.zona = oportunidad.zona;
    if (oportunidad.requisitos) updateData.requisitos = oportunidad.requisitos;
    if (oportunidad.estado) updateData.estado = oportunidad.estado;

    const { error: updateError } = await supabase
      .from('oportunidades')
      .update(updateData)
      .eq('id', existingOpportunity.id);

    if (updateError) {
      console.error('Error updating opportunity:', updateError);
      throw new Error(`Error updating opportunity: ${updateError.message}`);
    }

    console.log('Opportunity updated successfully!');
    return {
      opportunityId: existingOpportunity.id,
      success: true,
      isNew: false,
    };

  } catch (error) {
    console.error('Error updating opportunity:', error);
    throw error;
  }
}

export async function deleteOpportunityData(jsonData) {
  console.log('Starting delete opportunity...');
  console.log('Data:', JSON.stringify(jsonData, null, 2));

  try {
    const { numero_oportunidad } = jsonData;

    if (!numero_oportunidad) {
      throw new Error('Número de oportunidad no proporcionado');
    }

    console.log('Step A: Finding opportunity by number...');
    
    const { data: existingOpportunity, error: findError } = await supabase
      .from('oportunidades')
      .select('id')
      .eq('numero', numero_oportunidad)
      .maybeSingle();

    if (findError) {
      console.error('Error finding opportunity:', findError);
      throw new Error(`Error finding opportunity: ${findError.message}`);
    }

    if (!existingOpportunity) {
      throw new Error(`No se encontró la oportunidad #${numero_oportunidad}`);
    }

    console.log('Opportunity found, ID:', existingOpportunity.id);

    console.log('Step B: Deleting opportunity...');

    const { error: deleteError } = await supabase
      .from('oportunidades')
      .delete()
      .eq('id', existingOpportunity.id);

    if (deleteError) {
      console.error('Error deleting opportunity:', deleteError);
      throw new Error(`Error deleting opportunity: ${deleteError.message}`);
    }

    console.log('Opportunity deleted successfully!');
    return {
      opportunityId: existingOpportunity.id,
      success: true,
      isNew: false,
    };

  } catch (error) {
    console.error('Error deleting opportunity:', error);
    throw error;
  }
}