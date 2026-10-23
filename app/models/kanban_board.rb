# frozen_string_literal: true

class KanbanBoard < ApplicationRecord
  GROUP_BY = %w[none assigned_to tracker version].freeze
  SCOPES = %w[all assigned authored watched].freeze

  belongs_to :user
  belongs_to :project, optional: true
  has_many :kanban_columns, dependent: :destroy

  validates :name, presence: true, length: { maximum: 60 }
  validates :group_by, inclusion: { in: GROUP_BY }

  def self.default_filters
    {
      'project_id' => '',
      'fixed_version_id' => '',
      'tracker_id' => '',
      'assigned_to_id' => '',
      'author_id' => '',
      'scope' => 'all'
    }
  end

  def self.create_with_defaults!(user, name)
    transaction do
      board = create!(user: user, name: name.to_s.strip, filters: default_filters, group_by: 'none')
      IssueStatus.sorted.each_with_index do |status, index|
        board.kanban_columns.create!(
          name: status.name,
          position: index + 1,
          status_ids: [status.id],
          target_status_id: status.id
        )
      end
      board
    end
  end

  def filters
    stored = self[:filters]
    parsed = stored.is_a?(Hash) ? stored : JSON.parse(stored.presence || '{}')
    self.class.default_filters.merge(parsed.stringify_keys)
  rescue JSON::ParserError
    self.class.default_filters
  end

  def filters=(value)
    merged = self.class.default_filters.merge((value || {}).stringify_keys)
    merged['scope'] = 'all' unless SCOPES.include?(merged['scope'].to_s)
    self[:filters] = merged.to_json
    self.project_id = merged['project_id'].presence
  end
end
