# Start the local app on port 3004, or use PORT/a supplied port.
up port=(env_var_or_default("PORT", "3004")):
    env PORT={{quote(port)}} npm run dev:local
