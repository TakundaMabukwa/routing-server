-- Add bi-weekly mileage tracking columns to eps_driver_rewards table

ALTER TABLE eps_driver_rewards
ADD COLUMN IF NOT EXISTS starting_mileage INTEGER,
ADD COLUMN IF NOT EXISTS current_mileage INTEGER,
ADD COLUMN IF NOT EXISTS biweek_start_date TIMESTAMP;

-- Add comment for documentation
COMMENT ON COLUMN eps_driver_rewards.starting_mileage IS 'Mileage at the start of current bi-weekly period';
COMMENT ON COLUMN eps_driver_rewards.current_mileage IS 'Latest mileage reading';
COMMENT ON COLUMN eps_driver_rewards.biweek_start_date IS 'Start date of current bi-weekly tracking period';
