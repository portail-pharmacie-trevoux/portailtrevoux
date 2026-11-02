ALTER TABLE quality_errors ADD COLUMN IF NOT EXISTS corrected_at TIMESTAMPTZ;
ALTER TABLE quality_errors ADD COLUMN IF NOT EXISTS corrected_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE quality_errors ADD COLUMN IF NOT EXISTS corrected_name TEXT;
ALTER TABLE quality_errors ADD COLUMN IF NOT EXISTS error_corrected BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE quality_errors ADD COLUMN IF NOT EXISTS correction_note TEXT NOT NULL DEFAULT '' CHECK(char_length(correction_note)<=100);
ALTER TABLE quality_errors ADD COLUMN IF NOT EXISTS correction_note_history JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Identical legacy-state preservation and recalculation to main: keep closed
-- errors closed; all other states derive from the existing information boxes.
UPDATE quality_errors SET error_corrected=TRUE WHERE status='closed' AND error_corrected=FALSE;
WITH automatic_states AS (
 SELECT id,CASE WHEN error_corrected THEN 'closed' WHEN patient_notified_at IS NOT NULL OR doctor_notified_at IS NOT NULL THEN 'in_progress' ELSE 'declared' END AS value FROM quality_errors
) UPDATE quality_errors e SET status=a.value,revision=e.revision+1,
 status_history=e.status_history||jsonb_build_array(jsonb_build_object('from',e.status,'to',a.value,'at',now(),'by','Portail+ — état automatique'))
 FROM automatic_states a WHERE e.id=a.id AND e.status<>a.value;
