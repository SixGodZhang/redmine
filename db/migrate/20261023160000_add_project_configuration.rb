class AddProjectConfiguration < ActiveRecord::Migration[8.1]
  def change
    create_table :project_issue_statuses do |t|
      t.integer :project_id, null: false
      t.integer :issue_status_id, null: false
      t.index [:project_id, :issue_status_id], unique: true, name: 'index_project_issue_statuses_unique'
    end

    create_table :project_issue_priorities do |t|
      t.integer :project_id, null: false
      t.integer :issue_priority_id, null: false
      t.index [:project_id, :issue_priority_id], unique: true, name: 'index_project_issue_priorities_unique'
    end

    add_column :workflows, :project_id, :integer
    add_index :workflows, :project_id
  end
end
