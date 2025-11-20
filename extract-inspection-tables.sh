#!/bin/bash

# Extract inspection tables from Supabase backup
# Usage: ./extract-inspection-tables.sh backup_file.sql

BACKUP_FILE=$1
OUTPUT_FILE="inspection_tables_backup.sql"

if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: ./extract-inspection-tables.sh backup_file.sql"
  exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Error: File $BACKUP_FILE not found"
  exit 1
fi

echo "🔍 Searching for inspection tables in $BACKUP_FILE..."
echo ""

# Find all CREATE TABLE statements with 'inspection' in the name
grep -i "CREATE TABLE.*inspection" "$BACKUP_FILE" | while read -r line; do
  table_name=$(echo "$line" | grep -oP '(?<=CREATE TABLE )[^ ]+' | grep -i inspection)
  echo "Found table: $table_name"
done

echo ""
echo "📝 Extracting inspection tables to $OUTPUT_FILE..."

# Extract CREATE TABLE and INSERT statements for inspection tables
> "$OUTPUT_FILE"  # Clear output file

# Get list of inspection table names
tables=$(grep -i "CREATE TABLE.*inspection" "$BACKUP_FILE" | grep -oP '(?<=CREATE TABLE )[^ ]+' | grep -i inspection)

for table in $tables; do
  echo "-- Extracting $table" >> "$OUTPUT_FILE"
  echo "" >> "$OUTPUT_FILE"
  
  # Extract CREATE TABLE statement
  sed -n "/CREATE TABLE.*$table/,/;/p" "$BACKUP_FILE" >> "$OUTPUT_FILE"
  echo "" >> "$OUTPUT_FILE"
  
  # Extract INSERT statements
  grep "INSERT INTO.*$table" "$BACKUP_FILE" >> "$OUTPUT_FILE"
  echo "" >> "$OUTPUT_FILE"
  echo "" >> "$OUTPUT_FILE"
done

echo "✅ Done! Check $OUTPUT_FILE"
echo ""
echo "To import with renamed tables, run:"
echo "  sed 's/CREATE TABLE \([^ ]*inspection[^ ]*\)/CREATE TABLE \1_backup/g' $OUTPUT_FILE > inspection_tables_renamed.sql"
