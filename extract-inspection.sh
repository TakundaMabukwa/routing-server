#!/bin/bash

echo "🔍 Extracting inspection tables from backup..."

# Decompress and search for inspection tables
gunzip -c "db_cluster-20-11-2025@02-31-22.backup (1).gz" > backup_temp.sql

echo "📋 Finding inspection tables..."
grep -i "CREATE TABLE.*inspection" backup_temp.sql | grep -oP '(?<=CREATE TABLE )[^ ]+' | grep -i inspection

echo ""
echo "📝 Extracting to inspection_tables.sql..."

# Extract inspection tables
> inspection_tables.sql

tables=$(grep -i "CREATE TABLE.*inspection" backup_temp.sql | grep -oP '(?<=CREATE TABLE )[^ ]+' | grep -i inspection)

for table in $tables; do
  echo "-- Table: $table" >> inspection_tables.sql
  sed -n "/CREATE TABLE.*$table/,/;/p" backup_temp.sql >> inspection_tables.sql
  echo "" >> inspection_tables.sql
  grep "INSERT INTO.*$table" backup_temp.sql >> inspection_tables.sql
  echo "" >> inspection_tables.sql
done

# Rename tables to add _backup suffix
sed 's/CREATE TABLE public\.\([^ ]*inspection[^ ]*\)/CREATE TABLE public.\1_backup/g' inspection_tables.sql > inspection_tables_backup.sql
sed -i 's/INSERT INTO public\.\([^ ]*inspection[^ ]*\)/INSERT INTO public.\1_backup/g' inspection_tables_backup.sql

rm backup_temp.sql

echo "✅ Done!"
echo "   - inspection_tables.sql (original names)"
echo "   - inspection_tables_backup.sql (renamed with _backup suffix)"
