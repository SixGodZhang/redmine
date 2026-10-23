class AddSectionNameToKanbanColumns < ActiveRecord::Migration[8.1]
  def change
    add_column :kanban_columns, :section_name, :string
  end
end
