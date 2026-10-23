class CreateKanbanBoards < ActiveRecord::Migration[8.1]
  def change
    create_table :kanban_boards do |t|
      t.integer :user_id, null: false
      t.string :name, null: false
      t.integer :project_id
      t.text :filters
      t.string :group_by, null: false, default: 'none'
      t.timestamps
    end
    add_index :kanban_boards, :user_id

    create_table :kanban_columns do |t|
      t.integer :kanban_board_id, null: false
      t.string :name, null: false
      t.integer :position, null: false, default: 1
      t.text :status_ids, null: false
      t.integer :target_status_id, null: false
      t.timestamps
    end
    add_index :kanban_columns, :kanban_board_id
  end
end
